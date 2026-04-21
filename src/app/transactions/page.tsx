import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { TransactionTable } from './TransactionTable'
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
  searchParams: { month?: string; category?: string; scope?: string }
}) {
  const supabase = createServerClient()
  const scope = searchParams.scope || 'all'

  const { data: allAccounts } = await supabase
    .from('accounts')
    .select('id, display_name, scope')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_active', true)

  const accounts = (allAccounts || []).map(a => ({ id: a.id, display_name: (a as { display_name: string }).display_name }))

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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        <a href="/import" className="text-sm text-emerald-700 font-medium hover:underline">
          Import CSV →
        </a>
      </div>

      {/* Scope filter pills */}
      <div className="flex gap-2 mb-4">
        {SCOPE_PILLS.map(pill => (
          <Link
            key={pill.value}
            href={pill.value === 'all' ? '/transactions' : `/transactions?scope=${pill.value}`}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              scope === pill.value
                ? 'bg-emerald-700 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {pill.label}
          </Link>
        ))}
      </div>

      <TransactionTable
        initialTransactions={transactions || []}
        accounts={accounts}
        initialCategory={searchParams.category || ''}
      />
    </div>
  )
}
