import { createServerClient } from './supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from './constants'
import { cleanMerchant } from './cleanMerchant'
import { guessCategory } from './autoCategory'
import { isTransfer } from './transferPatterns'
import { isDirectorIncome } from './directorIncome'

export interface RawTransaction {
  account_id: string
  date: string
  amount: number
  description: string
  basiq_transaction_id?: string
  is_transfer?: boolean
  category_hint?: string | null
  raw_description?: string | null
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

  // Load all merchant mappings once
  const supabase = createServerClient()
  const { data: mappings } = await supabase
    .from('merchant_mappings')
    .select('merchant, category, classification')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)

  const mappingMap = new Map<string, { category: string | null; classification: string | null }>()
  for (const m of (mappings ?? [])) {
    mappingMap.set(m.merchant, { category: m.category, classification: m.classification })
  }

  // Collect auto-assigned categories to persist as mappings
  const autoMappings = new Map<string, string>()

  for (const raw of raws) {
    if (raw.amount === 0) continue

    const merchant = cleanMerchant(raw.description)

    // Director income: positive credit from business — NOT a transfer, even if pattern matches
    if (isDirectorIncome(raw.description, raw.amount)) {
      toUpsert.push({
        household_id: DEFAULT_HOUSEHOLD_ID,
        account_id: raw.account_id,
        date: raw.date,
        amount: raw.amount,
        description: raw.description,
        merchant,
        category: 'Director Income',
        classification: null,
        is_transfer: false,
        basiq_transaction_id: raw.basiq_transaction_id ?? null,
        raw_description: raw.raw_description ?? null,
      })
      continue
    }

    const isTransferRow = raw.is_transfer || isTransfer(raw.description)

    if (isTransferRow) {
      // Store transfers with is_transfer=true so "Show excluded" can reveal them
      toUpsert.push({
        household_id: DEFAULT_HOUSEHOLD_ID,
        account_id: raw.account_id,
        date: raw.date,
        amount: raw.amount,
        description: raw.description,
        merchant,
        category: null,
        classification: null,
        is_transfer: true,
        basiq_transaction_id: raw.basiq_transaction_id ?? null,
        raw_description: raw.raw_description ?? null,
      })
      transfersSkipped++
      continue
    }

    const isIncome = raw.amount > 0

    let category: string | null = null
    let classification: string | null = null

    if (!isIncome) {
      const mapping = mappingMap.get(merchant)
      category = mapping?.category ?? raw.category_hint ?? guessCategory(merchant)
      classification = mapping?.classification ?? null
      if (!mapping && category !== null) {
        autoMappings.set(merchant, category)
      }
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
    })
  }

  // Persist auto-categorised merchants as mappings so the Mappings page shows them
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

  // Phase 1: Upsert all rows (insert new, update existing)
  // Omit ignoreDuplicates so conflicts trigger the ON CONFLICT clause
  const { data, error } = await supabase
    .from('transactions')
    .upsert(rows, { onConflict: 'account_id,date,amount,description' })
    .select('id, category')

  if (error) throw new Error(error.message)
  const inserted = data?.length ?? 0
  const autoCategorised = data?.filter(r => r.category !== null).length ?? 0

  // Phase 2: Backfill raw_description on existing rows where it's NULL
  // This ensures that even if upserted rows returned nothing (due to no actual changes),
  // rows with a composed raw_description will get populated
  const rowsWithRawDesc = rows.filter(r => r.raw_description !== null)
  let backfilled = 0

  if (rowsWithRawDesc.length > 0) {
    // Execute all updates in parallel for efficiency
    // Update raw_description only where it's currently NULL
    // Uses the same conflict key to identify rows
    const updatePromises = rowsWithRawDesc.map(row =>
      supabase
        .from('transactions')
        .update({ raw_description: row.raw_description })
        .eq('account_id', row.account_id)
        .eq('date', row.date)
        .eq('amount', row.amount)
        .eq('description', row.description)
        