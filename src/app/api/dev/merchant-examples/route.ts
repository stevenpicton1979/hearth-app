import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export async function GET(req: NextRequest) {
  const merchant = req.nextUrl.searchParams.get('merchant')
  if (!merchant) return NextResponse.json({ error: 'merchant required' }, { status: 400 })

  const supabase = createServerClient()

  // Query 1: explicit column list — no PostgREST join syntax
  const { data, error } = await supabase
    .from('transactions')
    .select('id, date, amount, description, raw_description, merchant, category, classification, is_transfer, source, account_id, linked_transfer_id')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('merchant', merchant)
    .order('source', { ascending: true, nullsFirst: true })
    .order('date', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // De-dup by (description, amount) key, keep up to 5 distinct examples.
  // Transfer rows always bypass de-dup (each has distinct source/destination).
  // Including amount in the key ensures a $10k transfer isn't collapsed with a $5k income
  // row that happens to share the same description.
  const seen = new Set<string>()
  const examples: Record<string, unknown>[] = []
  for (const rawRow of (data || []) as Record<string, unknown>[]) {
    if (rawRow.is_transfer || rawRow.linked_transfer_id) {
      examples.push({ ...rawRow })
      if (examples.length >= 5) break
      continue
    }
    const raw = ((rawRow.raw_description as string) || '').trim()
    const cleaned = ((rawRow.description as string) || '').trim()
    const key = `${raw || cleaned}|${rawRow.amount}`
    if (!key) continue
    if (seen.has(key)) {
      // Increment collapsed_count on the existing example
      const existing = examples.find(e => `${((e.raw_description as string) || (e.description as string) || '').trim()}|${e.amount}` === key)
      if (existing) existing.collapsed_count = ((existing.collapsed_count as number) || 1) + 1
      continue
    }
    seen.add(key)
    examples.push({ ...rawRow, collapsed_count: 1 })
    if (examples.length >= 5) break
  }

  // Collect all account_ids we need to resolve:
  //   - source account_id from each example
  //   - account_id of each linked transfer (fetched below)
  const sourceAccountIds = examples
    .map(ex => ex.account_id)
    .filter((id): id is string => typeof id === 'string')

  const linkedIds = examples
    .map(ex => ex.linked_transfer_id)
    .filter((id): id is string => typeof id === 'string')

  // Fetch linked transaction account_ids (plain .in(), no join syntax)
  const linkedTxnToAccount = new Map<string, string>() // linked_transfer_id → account_id
  if (linkedIds.length > 0) {
    const { data: linkedTxns } = await supabase
      .from('transactions')
      .select('id, account_id')
      .in('id', linkedIds)

    for (const lt of (linkedTxns ?? []) as { id: string; account_id: string }[]) {
      if (lt.account_id) linkedTxnToAccount.set(lt.id, lt.account_id)
    }
  }

  // Single accounts query for all needed ids (source + linked)
  const linkedAccountIds = Array.from(linkedTxnToAccount.values())
  const allAccountIds = Array.from(new Set([...sourceAccountIds, ...linkedAccountIds]))

  const accountNameMap = new Map<string, string>() // account_id → display_name
  if (allAccountIds.length > 0) {
    const { data: accts } = await supabase
      .from('accounts')
      .select('id, display_name')
      .in('id', allAccountIds)

    for (const a of (accts ?? []) as { id: string; display_name: string }[]) {
      if (a.display_name) accountNameMap.set(a.id, a.display_name)
    }
  }

  // Build a suffix → account name map for resolving "TRANSFER TO XXnnnn" descriptions
  const { data: allAccounts } = await supabase
    .from('accounts')
    .select('account_suffix, display_name')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .not('account_suffix', 'is', null)

  const suffixToName = new Map<string, string>()
  for (const a of (allAccounts ?? []) as { account_suffix: string; display_name: string }[]) {
    if (a.account_suffix) suffixToName.set(a.account_suffix.toUpperCase(), a.display_name)
  }

  // Annotate each example with from_account and transfer_destination
  // INVARIANT: transfer_destination must be set for ALL transfer transactions, even if linked_transfer_id is null.
  // If linked_transfer_id is null, transfer_destination will be null but should still be present.
  for (const ex of examples) {
    const srcId = ex.account_id as string | null
    ex.accou