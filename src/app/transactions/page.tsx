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

  const accounts = (allAccounts || []).map(a => ({
    id: a.id,
    display_name: (a as { display_name: string }).display_name,
  }))

  // Count needs-review items for badge
  const { count: reviewCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('needs_review', true)

  const scopedIds =
    scope === 'all'
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
  let reviewTxns: {
    id: string
    date: string
    amount: number
    merchant: string
    description: string
    raw_description?: string | null
    accounts?: { display_name: string } | null
  }[] | null = null

  if (tab === 'review') {
    const { data } = await supabase
      .from('transactions')
      .select('id, date, amount, merchant, description, raw_description, accounts(display_name)')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('needs_review', true)
      .order('date', { ascending: false })
      .limit(100)
    reviewTxns = data as typeof reviewTxns
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        <a href="/import" className="text-sm text-emerald-700 font-medium hover:underline">
          Import CSV &rarr;
        </a>
      </div>

      {/* Top-level tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        <Link
          href="/transactions?tab=transactions"
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            tab !== 'review'
              ? 'bg-white border border-b-white border-gray-200 text-gray-900'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Transactions
        </Link>
        <Link
          href="/transactions?tab=review"
          className={`px-4 py-2 text-sm font-medium rounded-t-lg flex items-center gap-2 ${
            tab === 'review'
              ? 'bg-white border border-b-white border-gray-200 text-gray-900'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Needs Review
          {(reviewCount ?? 0) > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {reviewCount}
            </span>
          )}
        </Link>
      </div>

      {tab === 'review' ? (
        <NeedsReviewPanel transactions={reviewTxns ?? []} />
      ) : (
        <>
          {/* Scope pills */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {SCOPE_PILLS.map(pill => (
              <Link
                key={pill.value}
                href={`/transactions?scope=${pill.value}`}
                className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                  scope === pill.value
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                }`}
              >
                {pill.label}
              </Link>
            ))}
          </div>

          <TransactionTable
            transactions={transactions || []}
            accounts={accounts}
          />
        </>
      )}
    </div>
  )
}
