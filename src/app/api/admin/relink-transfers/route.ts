import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { parseXeroContactName } from '@/lib/xeroContactParser'

// Vercel Pro: allow up to 5 minutes for large backfills
export const maxDuration = 300

// ---------------------------------------------------------------------------
// POST /api/admin/relink-transfers
//
// Backfill endpoint: re-processes all existing transfer pairs and propagates
// gl_account and contact_name from the BHT side to the personal side.
//
// This is idempotent — safe to run multiple times.
// Run this once after deploying the Director Drawings migration, then run
// /api/admin/reprocess-csv to reclassify the personal-side transactions.
// ---------------------------------------------------------------------------

export async function POST() {
  const supabase = createServerClient()

  // Fetch all linked transfer pairs where the BHT side has a gl_account.
  // We identify the BHT side as the row with a non-null gl_account (Xero-synced).
  const { data: bhtRows, error } = await supabase
    .from('transactions')
    .select('id, linked_transfer_id, gl_account, raw_description')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_transfer', true)
    .not('linked_transfer_id', 'is', null)
    .not('gl_account', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!bhtRows || bhtRows.length === 0) return NextResponse.json({ updated: 0 })

  // For each BHT row, update its linked personal-side row with the propagated fields.
  const BATCH = 50
  let updated = 0

  for (let i = 0; i < bhtRows.length; i += BATCH) {
    const batch = bhtRows.slice(i, i + BATCH)
    const results = await Promise.all(
      batch.map(row => {
        const contactName = parseXeroContactName(row.raw_description)
        return supabase
          .from('transactions')
          .update({
            linked_gl_account: row.gl_account,
            contact_name: contactName,
          })
          .eq('id', row.linked_transfer_id)
      })
    )
    const batchErr = results.find(r => r.error)
    if (batchErr?.error) {
      return NextResponse.json({ error: `batch ${i}: ${batchErr.error.message}` }, { status: 500 })
    }
    updated += batch.length
  }

  return NextResponse.json({ updated })
}
