import { createServerClient } from './supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from './constants'
import { cleanMerchant } from './cleanMerchant'
import { guessCategory } from './autoCategory'
import { isTransfer } from './transferPatterns'

export interface RawTransaction {
  account_id: string
  date: string
  amount: number
  description: string
  basiq_transaction_id?: string
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

  for (const raw of raws) {
    if (raw.amount >= 0) continue
    if (isTransfer(raw.description)) { transfersSkipped++; continue }

    const merchant = cleanMerchant(raw.description)
    const mapping = mappingMap.get(merchant)
    const category = mapping?.category ?? guessCategory(merchant)
    const classification = mapping?.classification ?? null

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
    })
  }

  return { toUpsert, transfersSkipped }
}

export async function upsertTransactions(rows: ProcessedTransaction[]): Promise<{ inserted: number; duplicates: number }> {
  if (rows.length === 0) return { inserted: 0, duplicates: 0 }
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('transactions')
    .upsert(rows, { onConflict: 'account_id,date,amount,description', ignoreDuplicates: true })
    .select('id')

  if (error) throw new Error(error.message)
  const inserted = data?.length ?? 0
  return { inserted, duplicates: rows.length - inserted }
}
