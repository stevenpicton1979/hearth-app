import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { processBatch, upsertTransactions } from '@/lib/categoryPipeline'
import type { RawTransaction } from '@/lib/categoryPipeline'

// Vercel Pro: allow up to 5 minutes for large datasets
export const maxDuration = 300

// ---------------------------------------------------------------------------
// POST /api/admin/reprocess-csv
//
// Re-runs the category pipeline over all existing CSV transactions so that
// newly added merchant rules, category mappings, and transfer patterns are
// applied retroactively. Idempotent — safe to call multiple times.
// ---------------------------------------------------------------------------

export async function POST() {
  const supabase = createServerClient()

  const { data: rows, error } = await supabase
    .from('transactions')
    .select('id, account_id, date, amount, merchant, external_id, source, is_transfer, raw_description, gl_account')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('source', 'csv')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const raws: RawTransaction[] = (rows ?? []).map(row => ({
    account_id: row.account_id as string,
    date: row.date as string,
    amount: row.amount as number,
    // Use the already-cleaned merchant name as description so processBatch
    // re-runs rules against the same string the original import used.
    description: row.merchant as string,
    external_id: row.external_id as string | undefined,
    source: row.source as string,
    is_transfer: row.is_transfer as boolean,
    category_hint: null,
    raw_description: row.raw_description as string | null,
    gl_account: row.gl_account as string | null,
    gl_tax_type: null,
  }))

  const { toUpsert, transfersSkipped } = await processBatch(raws)
  const { inserted } = await upsertTransactions(toUpsert)

  return NextResponse.json({ reprocessed: inserted, skipped: transfersSkipped })
}
