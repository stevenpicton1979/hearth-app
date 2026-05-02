import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { applyMerchantCategoryRules } from '@/lib/merchantCategoryRules'
import { guessCategory } from '@/lib/autoCategory'
import type { Category } from '@/lib/categories'

// Vercel Pro: allow up to 5 minutes for large datasets
export const maxDuration = 300

// ---------------------------------------------------------------------------
// POST /api/admin/reprocess-csv
//
// Re-runs the categorisation rules over all existing CSV transactions and
// UPDATE them in-place by ID. Does NOT use the insert/upsert path — all
// rows already exist, so we go straight to UPDATE.
// Idempotent — safe to call multiple times.
// ---------------------------------------------------------------------------

export async function POST() {
  const supabase = createServerClient()

  // ── 1. Load manual merchant mappings ──────────────────────────────────────
  const { data: mappingRows, error: mapErr } = await supabase
    .from('merchant_mappings')
    .select('merchant, category')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('source', 'manual')

  if (mapErr) return NextResponse.json({ error: mapErr.message }, { status: 500 })

  const manualMappings = new Map<string, Category>(
    (mappingRows ?? []).map(r => [r.merchant as string, r.category as Category])
  )

  // ── 2. Fetch all CSV transactions ─────────────────────────────────────────
  const { data: rows, error } = await supabase
    .from('transactions')
    .select('id, merchant, amount, gl_account')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('source', 'csv')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── 3. Re-apply rules to each row ─────────────────────────────────────────
  const updates: {
    id: string
    category: Category | null
    matched_rule: string | null
    is_subscription: boolean
    classification: string | null   // DB column name for owner/realm
  }[] = []

  for (const row of rows ?? []) {
    const merchant = row.merchant as string
    const amount = row.amount as number
    const glAccount = row.gl_account as string | null
    const isIncome = amount > 0

    const ctx = { isIncome, glAccount }
    const ruleResult = applyMerchantCategoryRules(merchant, ctx)

    if (ruleResult) {
      updates.push({
        id: row.id as string,
        category: ruleResult.category,
        matched_rule: `merchant:${ruleResult.ruleName}`,
        is_subscription: ruleResult.isSubscription,
        classification: ruleResult.owner,  // owner → classification column
      })
    } else {
      // Manual mapping → keyword fallback → null
      const category = manualMappings.get(merchant) ?? (guessCategory(merchant) as Category | null) ?? null
      updates.push({
        id: row.id as string,
        category,
        matched_rule: null,
        is_subscription: false,
        classification: null,
      })
    }
  }

  // ── 4. UPDATE each row by ID in parallel batches ─────────────────────────
  // Cannot use upsert (requires all NOT NULL columns on the INSERT path).
  // .update().eq('id') targets existing rows only — correct for reprocessing.
  const BATCH = 50
  let updated = 0

  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH)
    const results = await Promise.all(
      batch.map(u =>
        supabase
          .from('transactions')
          .update({
            category: u.category,
            matched_rule: u.matched_rule,
            is_subscription: u.is_subscription,
            classification: u.classification,
          })
          .eq('id', u.id)
      )
    )
    const batchErr = results.find(r => r.error)
    if (batchErr?.error) {
      return NextResponse.json({ error: `batch ${i}: ${batchErr.error.message}` }, { status: 500 })
    }
    updated += batch.length
  }

  return NextResponse.json({ reprocessed: updated })
}
