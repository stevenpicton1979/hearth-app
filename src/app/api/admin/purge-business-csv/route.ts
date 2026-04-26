import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// ---------------------------------------------------------------------------
// POST /api/admin/purge-business-csv[?confirm=true]
//
// Surgical dedup: only removes CSV records that have a confirmed Xero
// counterpart on the same account, matched by date + |amount|.
//
// Business accounts = institution = 'Xero' OR scope = 'business'
//
// Dry-run (default):
//   Returns { dry_run: true, accounts: [{ name, csv_total, confirmed_duplicates }],
//             total_to_delete } — nothing is deleted.
//
// ?confirm=true:
//   Deletes only the confirmed duplicate CSV rows and returns final counts.
//   ON DELETE SET NULL handles any linked_transfer_id back-references.
//
// Match key: date + '|' + Math.abs(amount).toFixed(2)
// A CSV record is a confirmed duplicate when its key exists in the Xero
// record set for the same account.  Pure-CSV records (no Xero counterpart)
// are left untouched.
// ---------------------------------------------------------------------------

type TxRow = {
  id: string
  date: string
  amount: number
}

function matchKey(date: string, amount: number): string {
  return `${date}|${Math.abs(amount).toFixed(2)}`
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
    return NextResponse.json({ dry_run: isDryRun, accounts: [], total_to_delete: 0 })
  }

  type AccountSummary = { name: string; id: string; csv_total: number; confirmed_duplicates: number }
  const accountSummary: AccountSummary[] = []
  const duplicateIds: string[] = []

  for (const acct of accounts) {
    // Load Xero records (have external_id)
    const { data: xeroRows, error: xeroErr } = await supabase
      .from('transactions')
      .select('id, date, amount')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('account_id', acct.id)
      .eq('source', 'xero')
      .not('external_id', 'is', null)

    if (xeroErr) return NextResponse.json({ error: xeroErr.message }, { status: 500 })

    const xeroKeys = new Set<string>(
      (xeroRows ?? []).map((r: TxRow) => matchKey(r.date, r.amount))
    )

    // Load CSV records (no external_id)
    const { data: csvRows, error: csvErr } = await supabase
      .from('transactions')
      .select('id, date, amount')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('account_id', acct.id)
      .eq('source', 'csv')
      .is('external_id', null)

    if (csvErr) return NextResponse.json({ error: csvErr.message }, { status: 500 })

    const csvTotal = (csvRows ?? []).length
    const confirmed = (csvRows ?? []).filter(
      (r: TxRow) => xeroKeys.has(matchKey(r.date, r.amount))
    )

    accountSummary.push({
      name: acct.display_name,
      id: acct.id,
      csv_total: csvTotal,
      confirmed_duplicates: confirmed.length,
    })

    for (const r of confirmed) duplicateIds.push(r.id)
  }

  const total = duplicateIds.length

  if (isDryRun) {
    return NextResponse.json({
      dry_run: true,
      accounts: accountSummary.filter(a => a.csv_total > 0),
      total_to_delete: total,
    })
  }

  if (total === 0) {
    return NextResponse.json({ dry_run: false, deleted: 0, accounts: accountSummary })
  }

  // Delete in chunks of 500 to stay within PostgREST .in() limits
  let deleted = 0
  const CHUNK = 500
  for (let i = 0; i < duplicateIds.length; i += CHUNK) {
    const chunk = duplicateIds.slice(i, i + CHUNK)
    const { error: delErr, count } = await supabase
      .from('transactions')
      .delete({ count: 'exact' })
      .in('id', chunk)

    if (delErr) return NextResponse.json({ error: delErr.message, deletedSoFar: deleted }, { status: 500 })
    deleted += count ?? chunk.length
  }

  return NextResponse.json({
    dry_run: false,
    deleted,
    accounts: accountSummary.filter(a => a.confirmed_duplicates > 0),
  })
}
