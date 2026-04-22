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
  raw_description?: string | null
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
  balance?: number
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

export interface Asset {
  id: string
  household_id: string
  name: string
  asset_type: 'property' | 'super' | 'shares' | 'cash' | 'other'
  value: number
  notes: string | null
  as_at: string
  updated_at: string
}

export interface Liability {
  id: string
  household_id: string
  name: string
  liability_type: 'mortgage' | 'personal_loan' | 'car_loan' | 'credit_card' | 'bnpl' | 'other'
  balance: number
  as_at: string
  updated_at: string
}

export interface Goal {
  id: string
  household_id: string
  name: string
  target_amount: number
  current_amount: number
  target_date: string | null
  is_complete: boolean
  emoji: string | null
  created_at: string
  updated_at: string
  linked_account_id?: string | null
}

export interface NetWorthSnapshot {
  id: string
  household_id: string
  total_assets: number
  total_liabilities: number
  net_worth: number
  recorded_at: string
}
