import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { buildCoverageRows, expandMerchantRows } from '@/lib/coverageReport'
import type { TxForCoverage, MatchStatus } from '@/lib/coverageReport'

// ---------------------------------------------------------------------------
// GET /api/dev/coverage
//
// Query params:
//   status=rule|gl|unmatched  filter by match status
//   unmatched=true            legacy alias for status=unmatched
//   account=<id>              filter to a single account
//   source=xero|csv           filter by transaction source
//   from=YYYY-MM-DD           filter by date range start (inclusive)
//   to=YYYY-MM-DD             filter by date range end (inclusive)
//   merchant=<name>           expand: return individual transactions for one merchant
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const statusParam = searchParams.get('status') as MatchStatus | null
  const unmatchedOnly = searchParams.get('unmatched') === 'true'
  const filterStatus: MatchStatus | null = statusParam ?? (unmatchedOnly ? 'unmatched' : null)
  const accountId = searchParams.get('account')
  const source = searchParams.get('source')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const expandMerchant = searchParams.get('merchant')

  const supabase = createServerClient()

  let query = supabase
    .from('transactions')
    .select('merchant, amount, category, matched_rule, classification, raw_description, gl_account, date')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_transfer', false)

  if (accountId) query = query.eq('account_id', accountId)
  if (source) query = query.eq('source', source)
  if (from) query = query.gte('date', from)
  if (to) query = query.lte('date', to)
  if (expandMerchant) query = query.eq('merchant', expandMerchant)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as TxForCoverage[]

  if (expandMerchant) {
    return NextResponse.json({ transactions: expandMerchantRows(rows) })
  }

  return NextResponse.json({ rows: buildCoverageRows(rows, filterStatus) })
}
