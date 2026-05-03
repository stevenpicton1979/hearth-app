import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { runBusinessTransactionsWipe } from '@/lib/businessTransactionsWipe'
import { runXeroFullSync } from '@/lib/xeroSyncRunner'

// ---------------------------------------------------------------------------
// POST /api/admin/wipe-and-resync[?confirm=true]
//
// Single-command replacement for the two-step runbook:
//   1. Wipe all business transactions
//   2. Full Xero sync
//   3. Verify per-account row counts and return a status report
//
// Dry-run (default — no ?confirm=true):
//   Returns a preview of accounts that would be wiped, with pre-wipe counts.
//   Nothing is deleted or synced.
//
// ?confirm=true:
//   Executes wipe → sync → verify. Returns per-account status with
//   ok / warn / error / info classifications.
//
// Per-account status:
//   ok    — post-sync count within 5% of pre-wipe count (or both zero)
//   info  — post-sync count > pre-wipe × 1.05 (legitimate growth)
//   warn  — post-sync count < pre-wipe × 0.95 (significant drop, investigate)
//   error — post-sync count is 0 but pre-wipe count was > 0 (sync failed)
//
// overall ok: true when every account is 'ok' or 'info'
// ---------------------------------------------------------------------------

// Vercel Pro: allow up to 5 minutes (wipe + full sync can take a while)
export const maxDuration = 300

type AccountStatus = 'ok' | 'warn' | 'error' | 'info'

type AccountRow = {
  id: string
  display_name: string
  last_xero_sync_count: number | null
  last_xero_synced_at: string | null
}

function classifyAccount(preWipeCount: number, postSyncCount: number): AccountStatus {
  if (postSyncCount === 0) return preWipeCount === 0 ? 'ok' : 'error'
  const lower = preWipeCount * 0.95
  const upper = preWipeCount * 1.05
  if (postSyncCount >= lower && postSyncCount <= upper) return 'ok'
  if (postSyncCount < lower) return 'warn'
  return 'info'
}

function statusMessage(status: AccountStatus, pre: number, post: number): string | undefined {
  if (status === 'error') return `Sync failed: 0 rows after sync (was ${pre})`
  if (status === 'warn') return `Significant drop: ${post} rows after sync (was ${pre})`
  if (status === 'info') return `Significant gain: ${post} rows after sync (was ${pre})`
  return undefined
}

export async function POST(req: NextRequest) {
  const isConfirmed = req.nextUrl.searchParams.get('confirm') === 'true'
  const startMs = Date.now()
  const supabase = createServerClient()

  // Fetch business accounts with metadata
  const { data: accounts, error: acctErr } = await supabase
    .from('accounts')
    .select('id, display_name, last_xero_sync_count, last_xero_synced_at')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .or('institution.eq.Xero,scope.eq.business')

  if (acctErr) return NextResponse.json({ error: acctErr.message }, { status: 500 })
  const acctList = (accounts ?? []) as AccountRow[]

  // ── Dry-run ──────────────────────────────────────────────────────────────
  if (!isConfirmed) {
    const wipePreview = await runBusinessTransactionsWipe(true)
    const previewByAccount = Object.fromEntries(wipePreview.accounts.map(a => [a.id, a.count]))

    return NextResponse.json({
      dry_run: true,
      pre_wipe_total: wipePreview.total,
      accounts: acctList.map(a => ({
        id: a.id,
        name: a.display_name,
        pre_wipe_count: previewByAccount[a.id] ?? 0,
        last_xero_sync_count: a.last_xero_sync_count,
        last_xero_synced_at: a.last_xero_synced_at,
      })),
      message: 'Pass ?confirm=true to execute wipe and resync',
    })
  }

  // ── Step 1: Wipe ─────────────────────────────────────────────────────────
  let wipeResult
  try {
    wipeResult = await runBusinessTransactionsWipe(false)
  } catch (e: unknown) {
    return NextResponse.json({ error: `Wipe failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }

  const preWipeByAccount = Object.fromEntries(wipeResult.accounts.map(a => [a.id, a.count]))

  // ── Step 2: Sync ─────────────────────────────────────────────────────────
  let syncResult
  try {
    syncResult = await runXeroFullSync()
  } catch (e: unknown) {
    // Sync threw — report the failure but don't try to "rollback" the wipe
    syncResult = {
      synced: 0,
      skipped: 0,
      backfilled: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    }
  }

  // ── Step 3: Post-sync verification ───────────────────────────────────────
  const accountResults = await Promise.all(
    acctList.map(async acct => {
      const { count } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('household_id', DEFAULT_HOUSEHOLD_ID)
        .eq('account_id', acct.id)

      const preWipeCount = preWipeByAccount[acct.id] ?? 0
      const postSyncCount = count ?? 0
      const status = classifyAccount(preWipeCount, postSyncCount)

      return {
        id: acct.id,
        name: acct.display_name,
        pre_wipe_count: preWipeCount,
        post_sync_count: postSyncCount,
        last_xero_sync_count: acct.last_xero_sync_count,
        status,
        message: statusMessage(status, preWipeCount, postSyncCount),
      }
    })
  )

  const hasSyncErrors = syncResult.errors.length > 0
  const hasAccountError = accountResults.some(a => a.status === 'error' || a.status === 'warn')
  const ok = !hasSyncErrors && !hasAccountError

  return NextResponse.json({
    ok,
    pre_wipe_total: wipeResult.total,
    post_sync_total: accountResults.reduce((s, a) => s + a.post_sync_count, 0),
    accounts: accountResults,
    sync_response: {
      synced: syncResult.synced,
      skipped: syncResult.skipped,
      errors: syncResult.errors,
    },
    duration_ms: Date.now() - startMs,
  })
}
