import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { TransactionTable } from './TransactionTable'
import NeedsReviewPanel from './NeedsReviewPanel'
import Link from 'next/link'

const SCOPE_PILLS = [
  { value: 'all', label: 'All' },
  { value: 'household', label: 'Household' },
  { value: 'business', label: 'Business' },
  { value: 'investment', label: 'Investment' },
]

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: { month?: string; category?: string; scope?: string; tab?: string }
}) {
  const supabase = createServerClient()
  const scope = searchParams.scope || 'all'
  const tab = searchParams.tab || 'transactions'

  const { data: allAccounts } = await supabase
    .from('accounts')
    .select('id, display_name, scope')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_active', true)

  const accounts = (allAccounts || []).map(a => ({ id: a.id, display_name: (a as { display_name: string }).display_name }))

  // Count needs-review items for badge
  const { count: reviewCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('needs_review', true)

  const scopedIds = scope === 'all'
    ? (allAccounts || []).map(a => a.id)
    : (allAccounts || [])
        .filter(a => ((a as { scope: string | null }).scope || 'household') === scope)
        .map(a => a.id)

  let txQuery = supabase
    .from('transactions')
    .select('*, accounts(display_name, institution)')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_transfer', false)
    .order('date', { ascending: false })
    .limit(50)

  if (scopedIds.length > 0 && scope !== 'all') {
    txQuery = txQuery.in('account_id', scopedIds) as typeof txQuery
  }

  const { data: transactions } = await txQuery

  // Needs-review transactions (unmatched Xero transfers)
  const { data: reviewTxns } = tab === 'review' ? await supabase
    .from('transactions')
    .select('*, accounts(display_name, institution)')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('needs_review', true)
    .order('date', { ascending: false })
    .limit(100) : { data: null }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        <a href="/import" className="text-sm text-emerald-700 font-medium hover:underline">
          Import CSV →
        </a>
      </div>

      {/* Top-level tabs */}
      <div className="f