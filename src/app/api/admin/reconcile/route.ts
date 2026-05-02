import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { getXeroConnection, getXeroBankTransactionCount } from '@/lib/xeroApi'
import {
  detectGapMonths,
  detectExternalIdDuplicates,
  detectCsvNearDuplicates,
} from '@/lib/reconcile'
import type { AccountReconciliation, ReconcileResult } from '@/lib/reconcile'

// ---------------------------------------------------------------------------
// GET /api/admin/reconcile
//
// Analyses data quality for all known Xero accounts:
//  1. Per-account DB transaction count + date coverage (gap months)
//  2. Per-account Xero API count (compared against DB count)
//  3. External-id duplicate check across all Xero transactions
//  4. CSV near-duplicate check (same merchant + amount + date)
//
// DB count: uses { count: 'exact' } to bypass Supabase's 1,000-row default
// limit, then fetches up to 10,000 date rows for gap analysis.
//
// Xero count: paginates BankTransactions per account (max 5,000), excluding
// RECEIVE-TRANSFER (which the sync skips). xeroCount is null when Xero is
// not connected or the lookup fails.
//
// Account matching: filters DB to institution='Xero' accounts.
// Within those accounts, external_id IS NOT NULL identifies Xero-sourced rows.
// ---------------------------------------------------------------------------

const XERO_DEFAULT_ACCOUNT_ID = '__xero_default__'

export async function GET() {
  const supabase = createServerClient()

  // ── 1. Load known Xero accounts + Xero connection in parallel ────────────
  const [{ data: accounts, error: acctErr }, connection] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, display_name, xero_account_id')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('institution', 'Xero'),
    getXeroConnection().catch(() => null),
  ])

  if (acctErr) return NextResponse.json({ error: acctErr.message }, { status: 500 })

  // ── 2. Per-account: DB count + gap analysis + Xero API count ─────────────
  const accountSummaries: AccountReconciliation[] = []

  await Promise.all((accounts ?? []).map(async (acct) => {
    // DB count — { count: 'exact' } gives the true total bypassing the 1,000-row
    // limit; .limit(10000) fetches enough date rows for gap detection.
    const { data: rows, count, error } = await supabase
      .from('transactions')
      .select('date', { count: 'exact' })
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('account_id', acct.id)
      .not('external_id', 'is', null)
      .limit(10000)

    if (error) return  // skip errored accounts; they'll show as 0-count

    const dates = (rows ?? []).map(r => r.date as string)
    const dbCount = count ?? dates.length
    const sorted = [...dates].sort()

    // Xero API count — skip pseudo-accounts and accounts without a Xero ID
    const xeroAccId = acct.xero_account_id as string | null
    let xeroCount: number | null = null
    if (connection && xeroAccId && xeroAccId !== XERO_DEFAULT_ACCOUNT_ID) {
      try {
        xeroCount = await getXeroBankTransactionCount(connection, xeroAccId)
      } catch {
        xeroCount = null  // non-fatal; page shows — for this account
      }
    }

    accountSummaries.push({
      id: acct.id,
      name: acct.display_name,
      xeroCount,
      dbCount,
      minDate: sorted[0] ?? null,
      maxDate: sorted[sorted.length - 1] ?? null,
      gapMonths: detectGapMonths(dates),
    })
  }))

  // Restore deterministic order (Promise.all runs in parallel)
  accountSummaries.sort((a, b) => a.name.localeCompare(b.name))

  // ── 3. External-id duplicate check ───────────────────────────────────────
  const { data: extIdRows, error: extErr } = await supabase
    .from('transactions')
    .select('external_id')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .not('external_id', 'is', null)

  if (extErr) return NextResponse.json({ error: extErr.message }, { status: 500 })

  const externalIdDuplicates = detectExternalIdDuplicates(
    (extIdRows ?? []).map(r => ({ external_id: r.external_id as string }))
  )

  // ── 4. CSV near-duplicate check ──────────────────────────────────────────
  const { data: csvRows, error: csvErr } = await supabase
    .from('transactions')
    .select('merchant, amount, date')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('source', 'csv')
    .is('external_id', null)

  if (csvErr) return NextResponse.json({ error: csvErr.message }, { status: 500 })

  const csvNearDuplicates = detectCsvNearDuplicates(
    (csvRows ?? []).map(r => ({
      merchant: r.merchant as string,
      amount: r.amount as number,
      date: r.date as string,
    }))
  )

  const result: ReconcileResult = {
    accounts: accountSummaries,
    externalIdDuplicates,
    csvNearDuplicates,
  }

  return NextResponse.json(result)
}
