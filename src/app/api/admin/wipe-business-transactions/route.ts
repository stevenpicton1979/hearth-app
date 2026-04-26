import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// ---------------------------------------------------------------------------
// POST /api/admin/wipe-business-transactions[?confirm=true]
//
// Deletes ALL transactions on business accounts (institution = 'Xero' OR
// scope = 'business'). Used as first step in repeatable data reimport process.
//
// Business accounts = institution = 'Xero' OR scope = 'business'
//
// Dry-run (default):
//   Returns { dry_run: true, accounts: [{ name, id, count }],
//             total } — nothing is deleted.
//
// ?confirm=true:
//   Deletes all transactions on business accounts and returns final counts.
//
// Deletes in chunks of 500 to stay within PostgREST .in() limits.
// ---------------------------------------------------------------------------

type AccountSummary = {
  name: string
  id: string
  count: number
}

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
    return NextResponse.json({ dry_run: isDryRun, accounts: [], total: 0 })
  }

  const accountSummary: AccountSummary[] = []
  const txIdsToDelete: string[] = []

  for (const acct of accounts) {
    // Count and collect transaction IDs for this account
    const { data: txRows, error: txErr } = await supabase
      .from('transactions')
      .select('id')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('account_id', acct.id)

    if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 })

    const count = (txRows ?? []).length
    accountSummary.push({
      name: acct.display_name,
      id: acct.id,
      count,
    })

    for (const row of txRows ?? []) {
      txIdsToDelete.push(row.id)
    }
  }

  const total = txIdsToDelete.length

  if (isDryRun) {
    return NextResponse.json({
      dry_run: true,
      accounts: accountSummary.filter((a) => a.count > 0),
      total,
    })
  }

  if (total === 0) {
    return NextResponse.json({
      dry_run: false,
      accounts: accountSummary.filter((a) => a.count > 0),
      total: 0,
    })
  }

  // Delete in chunks of 500 to stay within PostgREST .in() limits
  let deleted = 0
  const CHUNK = 500
  for (let i = 0; i < txIdsToDelete.length; i += CHUNK) {
    const chunk = txIdsToDelete.slice(i, i + CHUNK)
    const { error: delErr, count } = await supabase
      .from('transactions')
      .delete({ count: 'exact' })
      .in('id', chunk)

    if (delErr)
      return NextResponse.json(
        { error: delErr.message, deletedSoFar: deleted },
        { status: 500 }
      )
    deleted += count ?? chunk.length
  }

  return NextResponse.json({
    dry_run: false,
    accounts: accountSummary.filter((a) => a.count > 0),
    total: deleted,
  })
}
