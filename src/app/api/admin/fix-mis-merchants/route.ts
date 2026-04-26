import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { applyMerchantCategoryRules } from '@/lib/merchantCategoryRules'

// ---------------------------------------------------------------------------
// POST /api/admin/fix-mis-merchants
//
// One-off backfill for Xero transactions where merchant = 'MIS'.
// These were synced before cleanXeroMerchant learned to skip short Xero
// reference codes, so the catch-all code was stored verbatim as the merchant.
//
// For each affected row:
//   1. Extract the real bank description from raw_description.split(' | ')[0]
//   2. Run the named merchant rules against the extracted string
//   3. If a rule matches: update merchant + matched_rule
//   4. If no rule matches: leave unchanged (skipped)
//
// Returns { updated: number, skipped: number, breakdown: Record<ruleName, count> }
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000

type MisTxRow = {
  id: string
  amount: number
  raw_description: string | null
}

export async function POST() {
  const supabase = createServerClient()

  // Collect all transactions with matched_rule = 'merchant:xero_misc_code'
  const rows: MisTxRow[] = []
  let page = 0
  while (true) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, amount, raw_description')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('matched_rule', 'merchant:xero_misc_code')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    rows.push(...(data as MisTxRow[]))
    if (data.length < PAGE_SIZE) break
    page++
  }

  if (rows.length === 0) return NextResponse.json({ updated: 0, skipped: 0, total: 0, breakdown: {} })

  let updated = 0
  let skipped = 0
  const breakdown: Record<string, number> = {}

  for (const tx of rows) {
    // The real bank description is always the first pipe-separated segment
    const extracted = (tx.raw_description ?? '').split(' | ')[0].trim()

    // Skip if we can't extract anything meaningful
    if (!extracted || extracted.toUpperCase() === 'MIS') {
      skipped++
      continue
    }

    const isIncome = tx.amount > 0
    const result = applyMerchantCategoryRules(extracted, { amount: tx.amount, isIncome })

    if (!result) {
      skipped++
      continue
    }

    const newMatchedRule = `merchant:${result.ruleName}`
    const { error } = await supabase
      .from('transactions')
      .update({ merchant: extracted, matched_rule: newMatchedRule })
      .eq('id', tx.id)

    if (error) {
      return NextResponse.json(
        { error: error.message, updatedSoFar: updated },
        { status: 500 }
      )
    }

    updated++
    breakdown[newMatchedRule] = (breakdown[newMatchedRule] ?? 0) + 1
  }

  return NextResponse.json({ updated, skipped, total: rows.length, breakdown })
}
