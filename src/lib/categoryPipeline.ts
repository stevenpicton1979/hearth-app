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
  basiq_transaction_id?: string
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
  basiq_transaction_id: string | null
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
        basiq_transaction_id: raw.basiq_transaction_id ?? null,
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
        basiq_transaction_id: raw.basiq_transaction_id ?? null,
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
        basiq_transaction_id: raw.basiq_transaction_id ?? null,
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
      basiq_transaction_id: raw.basiq_transaction_id ?? null,
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

  // Single upsert — ON CONFLICT DO UPDATE sets all columns including raw_description
  // and needs_review, so no per-row backfill loop is needed.
  const { data, error } = await supabase
    .from('transactions')
    .upsert(rows, { onConflict: 'account_id,date,amount,description' })
    .select('id, category')

  if (error) throw new Error(error.message)
  const inserted = data?.length ?? 0
  const autoCategorised = data?.filter(r => r.category !== null).length ?? 0

  return { inserted, duplicates: 0, autoCategorised, backfilled: 0 }
}
