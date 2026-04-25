import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { classifyDirectorIncome } from '@/lib/directorIncome'
import { isTransfer } from '@/lib/transferPatterns'
import { applyMerchantCategoryRules } from '@/lib/merchantCategoryRules'

// ---------------------------------------------------------------------------
// POST /api/admin/backfill-matched-rule
//
// One-off endpoint that populates transactions.matched_rule for every row
// that currently has NULL there.  Re-applies the exact same rule logic as
// processBatch using the data already in the DB — no Xero API calls, no
// category changes.
//
// Attribution strategy (in priority order):
//
//  1. Director income   — classifyDirectorIncome(description, amount)
//                         Precise: same function, same inputs.
//
//  2. Transfer pattern  — isTransfer(description)
//                         Precise: re-runs the regex battery.
//
//  3. Merchant rule     — applyMerchantCategoryRules(merchant, ctx)
//     (isTransfer=true)   For is_transfer=true rows not caught by (2).
//
//  4. Merchant rule     — applyMerchantCategoryRules(merchant, ctx)
//     (non-transfer)      For normal expense/income rows.
//
//  5. Xero inference    — For source='xero' non-transfer rows whose category
//                         was set by a Xero transfer rule (not by director
//                         income or merchant rules).  We infer from the
//                         stored category value:
//                           Salary          → xero:personal-wage
//                           Payroll Expense → xero:sons-wages
//                           Director Income → xero:director-drawings
//
//  Rows that genuinely have no named rule (manual mappings, keyword guesses,
//  GL hints, Xero business-card-payoff transfers) stay NULL — that is correct.
// ---------------------------------------------------------------------------

const BATCH_SIZE = 500

type TxRow = {
  id: string
  description: string
  merchant: string
  amount: number
  is_transfer: boolean
  source: string | null
  category: string | null
  account_id: string
}

function inferMatchedRule(
  tx: TxRow,
  accountOwnerMap: Map<string, string>
): string | null {
  const accountOwner = accountOwnerMap.get(tx.account_id) ?? null
  const isIncome = tx.amount > 0

  // ── 1. Director income ──────────────────────────────────────────────────
  const directorResult = classifyDirectorIncome(tx.description, tx.amount)
  if (directorResult.match) return directorResult.ruleName

  // ── 2 & 3. Transfer rows ────────────────────────────────────────────────
  if (tx.is_transfer) {
    // 2. Local transfer pattern
    if (isTransfer(tx.description)) return 'transfer-pattern'

    // 3. Merchant rule that sets isTransfer (e.g. director_loan_repayment)
    const ruleResult = applyMerchantCategoryRules(tx.merchant, { amount: tx.amount, isIncome, accountOwner })
    if (ruleResult?.isTransfer) return `merchant:${ruleResult.ruleName}`

    // Remaining is_transfer=true rows: Xero business-card-payoff /
    // unmatched-transfer — we can't distinguish without original narration.
    // Leave null.
    return null
  }

  // ── 4. Named merchant category rule ────────────────────────────────────
  const ruleResult = applyMerchantCategoryRules(tx.merchant, { amount: tx.amount, isIncome, accountOwner })
  if (ruleResult && !ruleResult.isTransfer) return `merchant:${ruleResult.ruleName}`

  // ── 5. Xero transfer-rule inference ────────────────────────────────────
  // These are SPEND-TRANSFER rows where the Xero rule fired with
  // forced_is_transfer=false, placing the category via category_hint.
  // Director income and merchant rules didn't match (checked above),
  // so if source='xero' the category must have come from a Xero rule.
  if (tx.source === 'xero') {
    if (tx.category === 'Salary')          return 'xero:personal-wage'
    if (tx.category === 'Payroll Expense') return 'xero:sons-wages'
    if (tx.category === 'Director Income') return 'xero:director-drawings'
  }

  return null
}

export async function POST() {
  const supabase = createServerClient()

  // ── Load account owners for merchantCategoryRules context ───────────────
  const { data: accountRows, error: acctErr } = await supabase
    .from('accounts')
    .select('id, owner')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)

  if (acctErr) return NextResponse.json({ error: acctErr.message }, { status: 500 })

  const accountOwnerMap = new Map<string, string>()
  for (const a of accountRows ?? []) {
    if (a.owner) accountOwnerMap.set(a.id, a.owner)
  }

  // ── Fetch all NULL matched_rule transactions ─────────────────────────────
  const { data: txns, error: fetchErr } = await supabase
    .from('transactions')
    .select('id, description, merchant, amount, is_transfer, source, category, account_id')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .is('matched_rule', null)

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  const rows = (txns ?? []) as TxRow[]
  if (rows.length === 0) return NextResponse.json({ updated: 0, skipped: 0, total: 0 })

  // ── Infer matched_rule for each row ──────────────────────────────────────
  const updates: { id: string; matched_rule: string }[] = []
  let skipped = 0

  for (const tx of rows) {
    const rule = inferMatchedRule(tx, accountOwnerMap)
    if (rule) {
      updates.push({ id: tx.id, matched_rule: rule })
    } else {
      skipped++
    }
  }

  // ── Bulk update in batches ───────────────────────────────────────────────
  let updated = 0
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE)
    const { error: updateErr } = await supabase
      .from('transactions')
      .upsert(batch, { onConflict: 'id' })
    if (updateErr) {
      return NextResponse.json({
        error: `Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${updateErr.message}`,
        updatedSoFar: updated,
      }, { status: 500 })
    }
    updated += batch.length
  }

  // Breakdown by rule for the response log
  const breakdown: Record<string, number> = {}
  for (const { matched_rule } of updates) {
    breakdown[matched_rule] = (breakdown[matched_rule] ?? 0) + 1
  }

  return NextResponse.json({
    total: rows.length,
    updated,
    skipped,
    breakdown,
  })
}
