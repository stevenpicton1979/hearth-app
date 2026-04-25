import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export async function GET(req: NextRequest) {
  const merchant = req.nextUrl.searchParams.get('merchant')
  if (!merchant) return NextResponse.json({ error: 'merchant required' }, { status: 400 })

  const supabase = createServerClient()

  // Query 1: fetch example transactions with source account name
  const { data, error } = await supabase
    .from('transactions')
    .select('*, accounts!account_id(display_name)')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('merchant', merchant)
    .order('source', { ascending: true, nullsFirst: true })
    .order('date', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return up to 5 distinct recent transactions, newest first, de-dup by raw key
  const seen = new Set<string>()
  const examples: Record<string, unknown>[] = []
  for (const rawRow of (data || []) as Record<string, unknown>[]) {
    const raw = ((rawRow.raw_description as string) || '').trim()
    const cleaned = ((rawRow.description as string) || '').trim()
    const key = raw || cleaned
    if (!key || seen.has(key)) continue
    seen.add(key)

    const row: Record<string, unknown> = { ...rawRow }
    const srcJoin = row.accounts as { display_name?: string } | null
    row.account = srcJoin?.display_name ?? row.account_id
    delete row.accounts
    delete row.household_id

    examples.push(row)
    if (examples.length >= 5) break
  }

  // Query 2: for rows that have a linked_transfer_id, resolve the destination
  // account name via: SELECT a.display_name FROM transactions t
  //   JOIN accounts a ON a.id = t.account_id WHERE t.id IN (linked_ids)
  const linkedIds = examples
    .map(ex => ex.linked_transfer_id)
    .filter((id): id is string => typeof id === 'string')

  if (linkedIds.length > 0) {
    const { data: linkedRows } = await supabase
      .from('transactions')
      .select('id, accounts!account_id(display_name)')
      .in('id', linkedIds)

    const toAccountMap = new Map<string, string>()
    for (const lr of (linkedRows ?? []) as Record<string, unknown>[]) {
      const join = lr.accounts as { display_name?: string } | null
      if (join?.display_name) toAccountMap.set(lr.id as string, join.display_name)
    }

    for (const ex of examples) {
      const lid = ex.linked_transfer_id as string | null
      if (lid) ex.transfer_destination = toAccountMap.get(lid) ?? null
    }
  }

  // Strip internal columns
  for (const ex of examples) {
    delete ex.account_id
    delete ex.linked_transfer_id
  }

  return NextResponse.json({ examples })
}
