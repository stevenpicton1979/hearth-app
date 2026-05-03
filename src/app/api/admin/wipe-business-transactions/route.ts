import { NextRequest, NextResponse } from 'next/server'
import { runBusinessTransactionsWipe } from '@/lib/businessTransactionsWipe'

// ---------------------------------------------------------------------------
// POST /api/admin/wipe-business-transactions[?confirm=true]
//
// @deprecated Use POST /api/admin/wipe-and-resync?confirm=true instead.
// wipe-and-resync runs the wipe AND the full Xero sync in sequence, then
// verifies per-account row counts. This endpoint remains for debugging /
// wipe-only use cases.
//
// Deletes ALL transactions on business accounts (institution = 'Xero' OR
// scope = 'business'). Used as first step in repeatable data reimport process.
//
// Dry-run (default):
//   Returns { dry_run: true, accounts: [{ name, id, count }], total }
//
// ?confirm=true:
//   Deletes all transactions on business accounts and returns final counts.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const isDryRun = req.nextUrl.searchParams.get('confirm') !== 'true'

  try {
    const result = await runBusinessTransactionsWipe(isDryRun)
    return NextResponse.json({ dry_run: isDryRun, accounts: result.accounts, total: result.total })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
