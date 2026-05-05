// TODO: remove this diagnostic endpoint once linker bug resolved.
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export const maxDuration = 60

export async function GET() {
  const supabase = createServerClient()

  // Reproduce the EXACT query linkTransferPairs runs (no dates arg)
  const { data: rows, error } = await supabase
    .from('transactions')
    .select('id, account_id, date, amount, is_transfer, gl_account, raw_description')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .is('linked_transfer_id', null)
    .limit(50000)

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
  }

  if (!rows) {
    return NextResponse.json({ rows_returned: null, note: 'rows is null' })
  }

  // Group by date and count what would-be pairs look like
  const byDate = new Map<string, typeof rows>()
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, [])
    byDate.get(r.date)!.push(r)
  }

  let candidatePairs = 0
  for (const dayRows of Array.from(byDate.values())) {
    for (let i = 0; i < dayRows.length; i++) {
      for (let j = i + 1; j < dayRows.length; j++) {
        const a = dayRows[i], b = dayRows[j]
        if (a.account_id === b.account_id) continue
        if (!a.gl_account && !b.gl_account) continue
        if (Math.round(a.amount * 100) + Math.round(b.amount * 100) !== 0) continue
        candidatePairs++
      }
    }
  }

  return NextResponse.json({
    rows_returned: rows.length,
    rows_with_gl: rows.filter(r => r.gl_account !== null).length,
    distinct_dates: byDate.size,
    candidate_pairs: candidatePairs,
    sample_first_5: rows.slice(0, 5).map(r => ({
      date: r.date,
      amount: r.amount,
      gl_account: r.gl_account,
      account_id: r.account_id,
    })),
  })
}
