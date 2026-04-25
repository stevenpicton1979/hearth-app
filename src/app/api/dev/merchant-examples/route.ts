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

  // For transfer rows, look up the counterpart account (ABS amount match, different account, same date)
  const transferExamples = examples.filter(ex => ex.is_transfer === true)
  if (transferExamples.length > 0) {
    await Promise.all(transferExamples.map(async (ex) => {
      const amt    = ex.amount as number
      const date   = ex.date as string
      const srcId  = ex.account_id as string

      // Match either sign so same-sign transfer pairs are also found
      const { data: counterparts, error: cpErr } = await supabase
        .from('transactions')
        .select('account_id, accounts!account_id(display_name)')
        .eq('household_id', DEFAULT_HOUSEHOLD_ID)
        .eq('date', date)
        .or(`amount.eq.${-amt},amount.eq.${amt}`)
        .neq('account_id', srcId)
        .order('is_transfer', { ascending: false }) // prefer is_transfer=true
        .limit(5)

      // Attach debug info so the network tab shows exactly what was searched
      ex._debug = {
        searched: { date, amounts: [-amt, amt], source_account_id: srcId },
        counterparts_found: counterparts?.length ?? 0,
        counterpart_error: cpErr?.message ?? null,
        counterpart_rows: (counterparts ?? []).map((c: Record<string, unknown>) => ({
          account_id: c.account_id,
          display_name: (c.accounts as { display_name?: string } | null)?.display_name ?? null,
        })),
      }

      if (counterparts && counterparts.length > 0) {
        const cp    = counterparts[0] as Record<string, unknown>
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
