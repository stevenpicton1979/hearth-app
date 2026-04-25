import { createServerClient } from './supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from './constants'
import { cleanMerchant } from './cleanMerchant'
import { guessCategory } from './autoCategory'
import { isTransfer } from './transferPatterns'
import { classifyDirectorIncome } from './directorIncome'
import { applyMerchantCategoryRules } from './merchantCategoryRules'

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
}

export interface ProcessedTransaction {
  household_id: string
  account_id: string
  date: string
  amount: number
  description: string
  merchant: string
  category: string | null
  classification: string | null
  is_transfer: boolean
  /** Stable external ID — Xero BankTransactionID or Basiq transaction ID. Used as upsert key when present. */
  external_id: string | null
  raw_description?: string | null
  source?: string
  needs_review?: boolean
  gl_account?: string | null
  gl_tax_type?: string | null
}

export async function applyMappings(merchant: string): Promise<{ category: string | null; classification: string | null }> {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('merchant_mappings')
    .select('category, classification')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
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
      .eq('household_id', DEFAULT_HOUSEHOLD_ID),
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
        classification: null,
        is_transfer: false,
        external_id: raw.external_id ?? null,
        raw_description: raw.raw_description ?? null,
        needs_review: raw.needs_review ?? false,
        gl_account: raw.gl_account ?? null,
        gl_tax_type: raw.gl_tax_type ?? null,
      })
      continue
    }

    const isTransferRow = raw.forced_is_transfer !== undefined
      ? raw.forced_is_transfer
      : (raw.is_transfer || isTransfer(raw.description))

    if (isTransferRow) {
      toUpsert.push({
        household_id: DEFAULT_HOUSEHOLD_ID,
        account_id: raw.account_id,
        date: raw.date,
        amount: raw.amount,
        description: raw.description,
        merchant,
        category: raw.category_hint ?? null,
        classification: null,
        is_transfer: true,
        external_id: raw.external_id ?? null,
        raw_description: raw.raw_description ?? null,
        needs_review: raw.needs_review ?? false,
        gl_account: raw.gl_account ?? null,
        gl_tax_type: raw.gl_tax_type ?? null,
      })
      transfersSkipped++
      continue
    }

    const isIncome = raw.amount > 0

    let category: string | null = null
    const accountOwner = accountOwnerMap.get(raw.account_id) ?? null
    let classification: string | null = accountOwner

    // Apply named merchant rules first — these are explicit, testable, and documented.
    const ruleResult = applyMerchantCategoryRules(merchant, { amount: raw.amount, isIncome, accountOwner })
    if (ruleResult?.isTransfer) {
      // Rule says this is a transfer — push as transfer and skip categorisation
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
        external_id: raw.external_id ?? null,
        raw_description: raw.raw_description ?? null,
        needs_review: raw.needs_review ?? false,
        gl_account: raw.gl_account ?? null,
        gl_tax_type: raw.gl_tax_type ?? null,
      })
      transfersSkipped++
      continue
    }

    const mapping = mappingMap.get(merchant)
    if (mapping) {
      // User-confirmed merchant mapping — highest priority for both income and expense
      category = mapping.category
      if (mapping.classification != null) classification = mapping.classification
    } else if (ruleResult) {
      // Named merchant rule matched — use its category
      category = ruleResult.category
      if (!isIncome && category !== null) autoMappings.set(merchant, category)
    } else if (raw.category_hint) {
      // GL account from Xero — high confidence, applies to income and expense
      category = raw.category_hint
      if (!isIncome) autoMappings.set(merchant, category)
    } else if (!isIncome) {
      // Keyword guessing — expense only (income patterns are unreliable)
      category = guessCategory(merchant)
      // BPAY fallback: long-number BPAY references with no GL → Business
      if (category === null && /^\d{10,}\s+COMMBANK APP BPA/i.test(raw.description)) {
        category = 'Business'
      }
      // gl_tax_type tiebreaker: GST-coded transactions are business expenses
      if (category === null && raw.gl_tax_type === 'GST') {
        category = 'Business'
      }
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
      external_id: raw.external_id ?? null,
      raw_description: raw.raw_description ?? null,
      needs_review: raw.needs_review ?? false,
      gl_account: raw.gl_account ?? null,
      gl_tax_type: raw.gl_tax_type ?? null,
    })
  }

  if (autoMappings.size > 0) {
    const rows = Array.from(autoMappings.entries()).map(([merchant, category]) => ({
      household_id: DEFAULT_HOUSEHOLD_ID,
      merchant,
      category,
      classification: null,
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
  // Rows arriving with an external_id (e.g. Xero BankTransactionID) may already
  // exist in the DB from a previous sync that lacked an external_id. Find those
  // existing rows by (account_id, date, amount) and stamp them with the external_id
  // so the upsert below updates the right row rather than creating a duplicate.
  if (rowsWithExtId.length > 0) {
    const byAccount = new Map<string, ProcessedTransaction[]>()
    for (const r of rowsWithExtId) {
      const list = byAccount.get(r.account_id) ?? []
      list.push(r)
      byAccount.set(r.account_id, list)
    }

    for (const [accountId, accountRows] of Array.from(byAccount.entries())) {
      const dates = Array.from(new Set(accountRows.map(r => r.date)))
      const { data: existing } = await supabase
        .from('transactions')
        .select('id, date, amount, external_id')
        .eq('account_id', accountId)
        .in('date', dates)
        .is('external_id', null)

      if (!existing?.length) continue

      // Track matched rows to avoid double-assigning the same existing row
      const usedIds = new Set<string>()

      for (const newRow of accountRows) {
        const candidates = existing.filter(
          e => !usedIds.has(e.id) &&
               e.date === newRow.date &&
               Math.abs(e.amount - newRow.amount) < 0.001
        )
        if (candidates.length === 1) {
          // Exactly one unambiguous match — safe to stamp with external_id
          await supabase
            .from('transactions')
            .update({ external_id: newRow.external_id })
            .eq('id', candidates[0].id)
          usedIds.add(candidates[0].id)
          backfilled++
        }
        // 0 or 2+ matches: leave alone — either a genuine new row or ambiguous
      }
    }
  }

  let inserted = 0
  let autoCategorised = 0

  // ── Upsert rows that have an external_id ──────────────────────────────────
  // After the backfill above, any matching existing rows now have external_id set,
  // so this upsert will find and update them rather than inserting duplicates.
  if (rowsWithExtId.length > 0) {
    const { data, error } = await supabase
      .from('transactions')
      .upsert(rowsWithExtId, { onConflict: 'external_id' })
      .select('id, category')
    if (error) throw new Error(`upsert (external_id): ${error.message}`)
    inserted += data?.length ?? 0
    autoCategorised += data?.filter(r => r.category !== null).length ?? 0
  }

  // ── Upsert rows without an external_id (CSV imports, legacy Basiq) ────────
  if (rowsWithoutExtId.length > 0) {
    const { data, error } = await supabase
      .from('transactions')
      .upsert(rowsWithoutExtId, { onConflict: 'account_id,date,amount,description' })
      .select('id, category')
    if (error) throw new Error(`upsert (composite key): ${error.message}`)
    inserted += data?.length ?? 0
    autoCategorised += data?.filter(r => r.category !== null).length ?? 0
  }

  return { inserted, duplicates: 0, autoCategorised, backfilled }
}
