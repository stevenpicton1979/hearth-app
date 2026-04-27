import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
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
//  2. External-id duplicate check across all Xero transactions
//  3. CSV near-duplicate check (same merchant + amount + date)
//
// Note: Live Xero API count comparison is not implemented here — the Xero
// BankTransactions API does not expose a total-count header and full
// pagination is too slow for an on-demand endpoint. Use the last-sync
// count from the DB as the authoritative source after a full sync.
// ---------------------------------------------------------------------------

export async function GET() {
  const supabase = createServerClient()

  // ── 1. Load known Xero accounts ──────────────────────────────────────────
  const { data: accounts, error: acctErr } = await supabase
    .from('accounts')
    .select('id, display_name')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('institution', 'Xero')

  if (acctErr) return NextResponse.json({ error: acctErr.message }, { status: 500 })

  // ── 2. Per-account date fetch (for count + gap analysis) ─────────────────
  const accountSummaries: AccountReconciliation[] = []

  await Promise.all((accounts ?? []).map(async (acct) => {
    const { data: rows, error } = await supabase
      .from('transactions')
      .select('date')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('account_id', acct.id)
      .eq('source', 'xero')
      .not('external_id', 'is', null)

    if (error) return  // skip errored accounts; they'll show as 0-count

    const dates = (rows ?? []).map(r => r.date as string)
    const sorted = [...dates].sort()

    accountSummaries.push({
      id: acct.id,
      name: acct.display_name,
      dbCount: dates.length,
      minDate: sorted[0] ?? null,
      maxDate: sorted[sorted.length - 1] ?? null,
      gapMonths: detectGapMonths(dates),
    })
  }))

  // Restore insertion order (Promise.all returns in order, but just be explicit)
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
