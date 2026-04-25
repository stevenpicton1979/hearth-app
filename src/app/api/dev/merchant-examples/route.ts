import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export async function GET(req: NextRequest) {
  const merchant = req.nextUrl.searchParams.get('merchant')
  if (!merchant) return NextResponse.json({ error: 'merchant required' }, { status: 400 })

  const supabase = createServerClient()
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

    // Resolve account display name; keep account_id for transfer lookup below
    const row: Record<string, unknown> = { ...rawRow }
    const accountJoin = row.accounts as { display_name?: string } | null
    row.account = accountJoin?.display_name ?? row.account_id
    delete row.accounts
    delete row.household_id

    examples.push(row)
    if (examples.length >= 5) break
  }

  // For transfer rows, look up the counterpart account (opposite amount, same date)
  const transferExamples = examples.filter(ex => ex.is_transfer === true)
  if (transferExamples.length > 0) {
    await Promise.all(transferExamples.map(async (ex) => {
      const { data: counterparts } = await supabase
        .from('transactions')
        .select('account_id, accounts!account_id(display_name)')
        .eq('household_id', DEFAULT_HOUSEHOLD_ID)
        .eq('date', ex.date as string)
        .eq('amount', -(ex.amount as number))
        .neq('account_id', ex.account_id as string)
        .order('is_transfer', { ascending: false }) // prefer is_transfer=true matches
        .limit(1)

      if (counterparts && counterparts.length > 0) {
        const cp = counterparts[0] as Record<string, unknown>
        const cpJoin = cp.accounts as { display_name?: string } | null
        ex.transfer_destination = cpJoin?.display_name ?? cp.account_id
      }
    }))
  }

  // Strip internal columns
  for (const ex of examples) {
    delete ex.account_id
  }

  return NextResponse.json({ examples })
}
