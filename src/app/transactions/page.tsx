import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { TransactionTable } from './TransactionTable'

export default async function TransactionsPage() {
  const supabase = createServerClient()

  const [{ data: transactions }, { data: accounts }] = await Promise.all([
    supabase
      .from('transactions')
      .select('*, accounts(display_name, institution)')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('is_transfer', false)
      .order('date', { ascending: false })
      .limit(50),
    supabase
      .from('accounts')
      .select('id, display_name')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('is_active', true),
  ])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        <a href="/import" className="text-sm text-emerald-700 font-medium hover:underline">
          Import CSV →
        </a>
      </div>
      <TransactionTable
        initialTransactions={transactions || []}
        accounts={accounts || []}
      />
    </div>
  )
}
