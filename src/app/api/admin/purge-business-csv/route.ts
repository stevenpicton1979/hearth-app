import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// ---------------------------------------------------------------------------
// POST /api/admin/purge-business-csv[?confirm=true]
//
// Removes CSV-sourced transactions from business accounts so that Xero
// can be the single source of truth.
//
// Business accounts = institution = 'Xero' OR scope = 'business'
//
// Default (dry-run):
//   Returns { dry_run: true, accounts: [{ name, csv_count }], total_to_delete }
//   without deleting anything.
//
// With ?confirm=true:
//   Deletes all CSV rows from those accounts and returns { deleted, accounts }.
//   linked_transfer_id references to deleted rows are automatically nulled
//   by the ON DELETE SET NULL constraint.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const isDryRun = req.nextUrl.searchParams.get('confirm') !== 'true'
  const supabase = createServerClient()

  // Find all business accounts
  const { data: accounts, error: acctErr } = await supabase
    .from('accounts')
    .select('id, display_name, institution, scope')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .or('institution.eq.Xero,scope.eq.business')

  if (acctErr) return NextResponse.json({ error: acctErr.message }, { status: 500 })
  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ dry_run: isDryRun, accounts: [], total_to_delete: 0 })
  }

  // Count CSV transactions per account
  type AccountSummary = { name: string; id: string; csv_count: number }
  const accountSummary: AccountSummary[] = []
  let total = 0

  for (const acct of accounts) {
    const { count, error } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('account_id', acct.id)
      .eq('source', 'csv')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const n = count ?? 0
    accountSummary.push({ name: acct.display_name, id: acct.id, csv_count: n })
    total += n
  }

  if (isDryRun) {
    return NextResponse.json({
      dry_run: true,
      accounts: accountSummary.filter(a => a.csv_count > 0),
      total_to_delete: total,
    })
  }

  // Delete all CSV rows from business accounts
  const accountIds = accounts.map(a => a.id)
  const { error: delErr, count: deleted } = await supabase
    .from('transactions')
    .delete({ count: 'exact' })
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .in('account_id', accountIds)
    .eq('source', 'csv')

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({
    dry_run: false,
    deleted: deleted ?? total,
    accounts: accountSummary.filter(a => a.csv_count > 0),
  })
}
