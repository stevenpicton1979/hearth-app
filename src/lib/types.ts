export interface Transaction {
  id: string
  household_id: string
  account_id: string
  date: string
  amount: number
  description: string
  merchant: string
  category: string | null
  classification: string | null
  notes: string | null
  is_transfer: boolean
  created_at: string
  accounts?: { display_name: string; institution: string | null }
}

export interface Account {
  id: string
  household_id: string
  display_name: string
  institution: string | null
  account_type: string | null
  basiq_account_id: string | null
  last_synced_at: string | null
  is_active: boolean
  created_at: string
}

export interface MerchantMapping {
  id: string
  household_id: string
  merchant: string
  category: string | null
  classification: string | null
  notes: string | null
  updated_at: string
  transaction_count?: number
}

export interface ParsedTransaction {
  date: string
  amount: number
  description: string
  merchant: string
  category: string | null
  is_transfer: boolean
}

export interface ImportSummary {
  imported: number
  duplicates: number
  transfers_skipped: number
  auto_categorised: number
  errors: string[]
}

export interface SpendingSummary {
  category: string
  amount: number
  count: number
  percent: number
}

export interface DetectedSubscription {
  merchant: string
  account_id: string
  account_name: string
  amount: number
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annual'
  interval_days: number
  annual_estimate: number
  last_charged: string
  next_expected: string
  occurrences: number
  confidence: 'HIGH' | 'MEDIUM' | 'PROBABLE'
  is_lapsed: boolean
}
