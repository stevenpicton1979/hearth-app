import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { parseXeroContactName } from '@/lib/xeroContactParser'
import { linkTransferPairs } from '@/lib/transferLinker'

// Vercel Pro: allow up to 5 minutes for large backfills
export const maxDuration = 300

// POST /api/admin/relink-transfers
//
// Two-phase backfill:
//   Phase 1 — run the transfer linker over all dates to pair previously
//              unlinked rows and propagate BHT metadata to the personal side.
//   Phase 2 — for already-linked pairs (pre-migration data), propagate
//              gl_account + contact_name where it is still missing.
//
// Idempotent — safe to run multiple times.
// After this, run /api/admin/reprocess-csv to reclassify personal-side rows.

export async function POST() {
  const supabase = createServerClient()

  // ── Phase 1: link unlinked transfer pairs ───────────────────────────────
  // Omit the dates argument so linkTransferPairs fetches ALL unlinked rows
  // in one query. Passing all distinct dates would generate a URL that
  // exceeds PostgREST's ~8 KB limit and silently returns nothing.
  const { pairs, glPropagated: p1Gl, contactExtracted: p1Contact } = await linkTransferPairs()

  // ── Phase 2: propagate metadata to already-linked pre-migration rows ────
  // Paginate — PostgREST enforces a 1000-row server cap regardless of .limit().
  const PAGE_SIZE = 1000
  const { data: p0, error: p0Err } = await supabase
    .from('transactions')
    .select('id, linked_transfer_id, gl_account, raw_description')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .not('linked_transfer_id', 'is', null)
    .not('gl_account', 'is', null)
    .range(0, PAGE_SIZE - 1)

  if (p0Err) return NextResponse.json({ error: p0Err.message }, { status: 500 })
  const bhtRows = [...(p0 ?? [])]
  let lastFull = bhtRows.length === PAGE_SIZE

  for (let from = PAGE_SIZE; lastFull; from += PAGE_SIZE) {
    const { data: page, error } = await supabase
      .from('transactions')
      .select('id, linked_transfer_id, gl_account, raw_description')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .not('linked_transfer_id', 'is', null)
      .not('gl_account', 'is', null)
      .range(from, from + PAGE_SIZE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!page) break
    bhtRows.push(...page)
    lastFull = page.length === PAGE_SIZE
  }

  let p2Gl = 0
  let p2Contact = 0
  const BATCH = 50

  for (let i = 0; i < bhtRows.length; i += BATCH) {
    const batch = bhtRows.slice(i, i + BATCH)
    const results = await Promise.all(
      batch.map(row => {
        const contactName = parseXeroContactName(row.raw_description)
        if (row.gl_account) p2Gl++
        if (contactName) p2Contact++
        return supabase
          .from('transactions')
          .update({ linked_gl_account: row.gl_account, contact_name: contactName })
          .eq('id', row.linked_transfer_id)
      })
    )
    const batchErr = results.find(r => r.error)
    if (batchErr?.error) {
      return NextResponse.json({ error: `batch ${i}: ${batchErr.error.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({
    linked_pairs: pairs,
    gl_propagated: p1Gl + p2Gl,
    contact_extracted: p1Contact + p2Contact,
  })
}
