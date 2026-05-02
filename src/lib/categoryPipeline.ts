import { createServerClient } from './supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from './constants'
import { cleanMerchant } from './cleanMerchant'
import { guessCategory } from './autoCategory'
import { isTransfer } from './transferPatterns'
import { classifyDirectorIncome } from './directorIncome'
import { applyMerchantCategoryRules } from './merchantCategoryRules'
import type { Category } from './categories'

export interface RawTransaction {
  account_id: string
  date: string
  amount: number
  description: string
  /** Stable external ID for upsert deduplication — Xero BankTransactionID or Basiq transaction ID */
  external_id?: string
  is_transfer?: boolean
  forced_is_transfer?: boolean
  category_hint?: string | null
  raw_description?: string | null
  needs_review?: boolean
  gl_account?: string | null
  gl_tax_type?: string | null
  /**
   * Pre-assigned rule ID from upstream processing (e.g. Xero transfer rules).
   * When set, this is carried into ProcessedTransaction.matched_rule as-is,
   * unless a higher-priority in-pipeline rule overrides it.
   */
  matched_rule?: string | null
}

export interface ProcessedTransaction {
  household_id: string
  account_id: string
  date: string
  amount: number
  description: string
  merchant: string
  category: Category | null
  classification: string | null
  is_transfer: boolean
  /** Stable external ID — Xero BankTransactionID or Basiq transaction ID. Used as upsert key when present. */
  external_id: string | null
  raw_description?: string | null
  source?: string
  needs_review?: boolean
  gl_account?: string | null
  gl_tax_type?: string | null
  /**
   * Identifies which codified rule set the category/transfer flag.
   * Null means a manual merchant mapping, a keyword guess, or a GL category hint.
   * Format: "<engine>:<rule-name>", e.g.:
   *   "director-income:netbank-wage"
   *   "transfer-pattern"
   *   "merchant:ato_payments"
   *   "xero:personal-wage"
   */
  matched_rule: string | null
  is_subscription?: boolean
}

export async function applyMappings(merchant: string): Promise<{ category: string | null; classification: string | null }> {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('merchant_mappings')
    .select('category, classification')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('source', 'manual')
    .eq('merchant', merchant)
    .single()
  return { category: data?.category ?? null, classification: data?.classification ?? null }
}

export async function processBatch(raws: RawTransaction[]): Promise<{
  toUpsert: ProcessedTransaction[]
  transfersSkipped: number
}> {
  const toUpsert: ProcessedTransaction[] = []
  let transfersSkipped = 0

  const supabase = createServerClient()

  const uniqueAccountIds = Array.from(new Set(raws.map(r => r.account_id)))
  const [{ data: mappings }, { data: accountRows }] = await Promise.all([
    supabase
      .from('merchant_mappings')
      .select('merchant, category, classification')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('source', 'manual'),
    supabase
      .from('accounts')
      .select('id, owner')
      .in('id', uniqueAccountIds),
  ])

  const mappingMap = new Map<string, { category: string | null; classification: string | null }>()
  for (const m of (mappings ?? [])) {
    mappingMap.set(m.merchant, { category: m.category, classification: m.classification })
  }

  const accountOwnerMap = new Map<string, string>()
  for (const a of (accountRows ?? [])) {
    if (a.owner) accountOwnerMap.set(a.id, a.owner)
  }

  const autoMappings = new Map<string, string>()

  for (const raw of raws) {
    if (raw.amount === 0) continue

    const merchant = cleanMerchant(raw.description)

    // ── 1. Director income (highest priority — fires before transfer check) ──
    const directorResult = classifyDirectorIncome(raw.description, raw.amount)
    if (directorResult.match) {
      toUpsert.push({
        household_id: DEFAULT_HOUSEHOLD_ID,
        account_id: raw.account_id,
        date: raw.date,
        amount: raw.amount,
        description: raw.description,
        merchant,
        category: directorResult.category,
        classification: 'Joint',
        is_transfer: false,
        external_id: raw.external_id ?? null,
        raw_description: raw.raw_description ?? null,
        needs_review: raw.needs_review ?? false,
        gl_account: raw.gl_account ?? null,
        gl_tax_type: raw.gl_tax_type ?? null,
        matched_rule: directorResult.ruleName,
      })
      continue
    }

    // ── 2. Transfer detection ──────────────────────────────────────────────
    // Evaluate the transfer-pattern check once so we can use it in both the
    // boolean and the rule attribution without calling isTransfer() twice.
    const isPatternTransfer =
      raw.forced_is_transfer === undefined && isTransfer(raw.description)

    const isTransferRow = raw.forced_is_transfer !== undefined
      ? raw.forced_is_transfer
      : (raw.is_transfer || isPatternTransfer)

    if (isTransferRow) {
      // Attribute the transfer:
      //  • forced_is_transfer defined → Xero rule engine fired; rule name was
      //    passed in via raw.matched_rule (e.g. "xero:business-card-payoff")
      //  • pattern match              → local TRANSFER_PATTERNS matched
      //  • raw.is_transfer flag       → externally flagged (CSV import, etc.)
      const transferMatchedRule: string | null =
        raw.forced_is_transfer !== undefined
          ? (raw.matched_rule ?? null)   // from Xero rule engine
          : isPatternTransfer
            ? 'transfer-pattern'
            : null                       // bare is_transfer flag, no named rule

      toUpsert.push({
        household_id: DEFAULT_HOUSEHOLD_ID,
        account_id: raw.account_id,
        date: raw.date,
        amount: raw.amount,
        description: raw.description,
        merchant,
        category: (raw.category_hint ?? null) as Category | null,
        classification: null,
        is_transfer: true,
        is_subscription: false,
        external_id: raw.external_id ?? null,
        raw_description: raw.raw_description ?? null,
        needs_review: raw.needs_review ?? false,
        gl_account: raw.gl_account ?? null,
        gl_tax_type: raw.gl_tax_type ?? null,
        matched_rule: transferMatchedRule,
      })
      transfersSkipped++
      continue
    }

    // ── 3. Non-transfer categorisation ────────────────────────────────────
    const isIncome = raw.amount > 0

    let category: Category | null = null
    let isSubscription = false
    const accountOwner = accountOwnerMap.get(raw.account_id) ?? null
    let classification: string | null = accountOwner
    // Start with any upstream rule (e.g. a Xero non-transfer rule that resolved
    // to a category via category_hint); may be overridden below.
    let matchedRule: string | null = raw.matched_rule ?? null

    const ruleResult = applyMerchantCategoryRules(merchant, {
      isIncome,
      accountOwner,
      glAccount: raw.gl_account ?? null,
    })

    if (ruleResult?.isTransfer) {
      toUpsert.push({
        household_id: DEFAULT_HOUSEHOLD_ID,
        account_id: raw.account_id,
        date: raw.date,
        amount: raw.amount,
        description: raw.description,
        merchant,
        category: null,
        classification,
        is_transfer: true,
        is_subscription: false,
        external_id: raw.external_id ?? null,
        raw_description: raw.raw_description ?? null,
        needs_review: raw.needs_review ?? false,
        gl_account: raw.gl_account ?? null,
        gl_tax_type: raw.gl_tax_type ?? null,
        matched_rule: `merchant:${ruleResult.ruleName}`,
      })
      transfersSkipped++
      continue
    }

    const mapping = mappingMap.get(merchant)
    if (mapping) {
      // Manual merchant mapping — highest confidence, clears any upstream rule
      category = mapping.category as Category | null
      if (mapping.classification != null) classification = mapping.classification
      matchedRule = null
    } else if (ruleResult) {
      // Named merchant category rule
      category = ruleResult.category
      matchedRule = `merchant:${ruleResult.ruleName}`
      if (ruleResult.owner !== null) classification = ruleResult.owner
      isSubscription = ruleResult.isSubscription
    } else if (raw.category_hint) {
      // GL account hint or Xero non-transfer rule category (passed via category_hint)
      category = raw.category_hint as Category
      // Keep matchedRule = raw.matched_rule (e.g. "xero:personal-wage") if set
      if (!isIncome) autoMappings.set(merchant, category)
    } else if (!isIncome) {
      // Keyword fallback — not a named rule
      category = guessCategory(merchant) as Category | null
      if (category === null && /^\d{10,}\s+COMMBANK APP BPA/i.test(raw.description)) {
        category = 'Government & Tax'
      }
      if (category === null && raw.gl_tax_type === 'GST') {
        category = 'Office Expenses'
      }
      matchedRule = null
      if (category !== null) autoMappings.set(merchant, category)
    }

    toUpsert.push({
      household_id: DEFAULT_HOUSEHOLD_ID,
      account_id: raw.account_id,
      date: raw.date,
      amount: raw.amount,
      description: raw.description,
      merchant,
      category,
      classification,
      is_transfer: false,
      is_subscription: isSubscription,
      external_id: raw.external_id ?? null,
      raw_description: raw.raw_description ?? null,
      needs_review: raw.needs_review ?? false,
      gl_account: raw.gl_account ?? null,
      gl_tax_type: raw.gl_tax_type ?? null,
      matched_rule: matchedRule,
    })
  }

  if (autoMappings.size > 0) {
    const rows = Array.from(autoMappings.entries()).map(([merchant, category]) => ({
      household_id: DEFAULT_HOUSEHOLD_ID,
      merchant,
      category,
      classification: null,
      source: 'auto',
    }))
    await supabase
      .from('merchant_mappings')
      .upsert(rows, { onConflict: 'household_id,merchant', ignoreDuplicates: true })
  }

  return { toUpsert, transfersSkipped }
}

export async function upsertTransactions(rows: ProcessedTransaction[]): Promise<{ inserted: number; duplicates: number; autoCategorised: number; backfilled: number }> {
  if (rows.length === 0) return { inserted: 0, duplicates: 0, autoCategorised: 0, backfilled: 0 }
  const supabase = createServerClient()

  const rowsWithExtId = rows.filter(r => r.external_id != null)
  const rowsWithoutExtId = rows.filter(r => r.external_id == null)
  let backfilled = 0

  // ── Backfill step ─────────────────────────────────────────────────────────
  // Rows arriving with an external_id may already exist from a previous sync
  // that lacked one. Match by (account_id, date, amount) and stamp external_id
  // so the upsert below hits the right row instead of creating a duplicate.
  // All account queries run in parallel; matched pairs are written in one bulk upsert.
  if (rowsWithExtId.length > 0) {
    const byAccount = new Map<string, ProcessedTransaction[]>()
    for (const r of rowsWithExtId) {
      const list = byAccount.get(r.account_id) ?? []
      list.push(r)
      byAccount.set(r.account_id, list)
    }

    const backfillPairs: { id: string; external_id: string }[] = []

    await Promise.all(Array.from(byAccount.entries()).map(async ([accountId, accountRows]) => {
      const dates = Array.from(new Set(accountRows.map(r => r.date)))
      const { data: existing } = await supabase
        .from('transactions')
        .select('id, date, amount, external_id')
        .eq('account_id', accountId)
        .in('date', dates)
        .is('external_id', null)

      if (!existing?.length) return

      const usedIds = new Set<string>()
      for (const newRow of accountRows) {
        const candidates = existing.filter(
          e => !usedIds.has(e.id) &&
               e.date === newRow.date &&
               Math.abs(e.amount - newRow.amount) < 0.001
        )
        if (candidates.length === 1) {
          backfillPairs.push({ id: candidates[0].id, external_id: newRow.external_id! })
          usedIds.add(candidates[0].id)
        }
      }
    }))

    // Single bulk upsert — one DB round-trip regardless of match count
    if (backfillPairs.length > 0) {
      await supabase.from('transactions').upsert(backfillPairs, { onConflict: 'id' })
      backfilled = backfillPairs.length
    }
  }

  let inserted = 0
  let autoCategorised = 0

  // ── Upsert rows that have an external_id ──────────────────────────────────
  if (rowsWithExtId.length > 0) {
    const { data, error } = await supabase
      .from('transactions')
      .upsert(rowsWithExtId, { onConflict: 'external_id' })
      .select('id, category')
    if (error) throw new Error(`upsert (external_id): ${error.message}`)
    inserted += data?.length ?? 0
    autoCategorised += data?.filter(r => r.category !== null).length ?? 0
  }

  // ── Insert rows without an external_id (CSV imports, legacy Basiq) ─────────
  // We cannot use ON CONFLICT with the composite key because the unique index
  // is partial (WHERE external_id IS NULL) and PostgREST does not support
  // partial indexes in upsert.  Instead: query what already exists for the
  // same (account_id, date) combinations, subtract matches, then plain-insert.
  if (rowsWithoutExtId.length > 0) {
    // Group by account so we can query per-account efficiently (usually 1 account)
    const byAccount = new Map<string, ProcessedTransaction[]>()
    for (const r of rowsWithoutExtId) {
      const list = byAccount.get(r.account_id) ?? []
      list.push(r)
      byAccount.set(r.account_id, list)
    }

    const toInsert: ProcessedTransaction[] = []

    for (const [accountId, accountRows] of Array.from(byAccount.entries())) {
      const dates = Array.from(new Set(accountRows.map(r => r.date)))
      // Query ALL existing rows (not just null-external_id ones) so a CSV row
      // that matches an existing Xero record on date+amount+description is
      // correctly skipped rather than inserted as a duplicate.
      const { data: existing } = await supabase
        .from('transactions')
        .select('date, amount, description')
        .eq('account_id', accountId)
        .in('date', dates)

      const existingKeys = new Set(
        (existing ?? []).map(e => `${e.date}|${e.amount}|${e.description}`)
      )

      for (const r of accountRows) {
        const key = `${r.date}|${r.amount}|${r.description}`
        if (!existingKeys.has(key)) toInsert.push(r)
      }
    }

    if (toInsert.length > 0) {
      const { data, error } = await supabase
        .from('transactions')
        .insert(toInsert)
        .select('id, category')
      if (error) throw new Error(`insert (composite key): ${error.message}`)
      inserted += data?.length ?? 0
      autoCategorised += data?.filter(r => r.category !== null).length ?? 0
    }
  }

  return { inserted, duplicates: 0, autoCategorised, backfilled }
}
