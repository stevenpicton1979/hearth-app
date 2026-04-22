import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import Link from 'next/link'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

function getMonthBounds(month: string): { start: string; end: string } {
  const [year, mon] = month.split('-').map(Number)
  const lastDay = new Date(year, mon, 0).getDate()
  const start = `${year}-${String(mon).padStart(2, '0')}-01`
  const end = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

function offsetMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number)
  const d = new Date(year, mon - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  return new Date(year, mon - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

interface Transaction {
  id: string
  date: string
  amount: number
  description: string | null
  category: string | null
}

export default async function BusinessPage({
  searchParams,
}: {
  searchParams: { month?: string }
}) {
  const today = new Date()
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const selectedMonth = searchParams.month || currentMonth
  const prevMonth = offsetMonth(selectedMonth, -1)
  const nextMonth = offsetMonth(selectedMonth, 1)
  const isCurrentMonth = selectedMonth === currentMonth

  const { start, end } = getMonthBounds(selectedMonth)
  const supabase = createServerClient()

  const { data: bizAccounts } = await supabase
    .from('accounts')
    .select('id, display_name')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('scope', 'business')

  const bizIds = bizAccounts?.map(a => a.id) ?? []

  let transactions: Transaction[] = []

  if (bizIds.length > 0) {
    const { data } = await supabase
      .from('transactions')
      .select('id, date, amount, description, category')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('is_transfer', false)
      .gte('date', start)
      .lte('date', end)
      .in('account_id', bizIds)
      .order('date', { ascending: false })

    transactions = data ?? []
  }

  const revenue = transactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0)

  const expenses = transactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const netProfit = revenue - expenses

  const byCategoryMap = new Map<string, number>()
  for (const t of transactions.filter(t => t.amount < 0)) {
    const cat = t.category || 'Uncategorized'
    byCategoryMap.set(cat, (byCategoryMap.get(cat) ?? 0) + Math.abs(t.amount))
  }
  const byCategory = Array.from(byCategoryMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)

  const merchantMap = new Map<string, number>()
  for (const t of transactions.filter(t => t.amount < 0)) {
    const m = t.description || 'Unknown'
    merchantMap.set(m, (merchantMap.get(m) ?? 0) + Math.abs(t.amount))
  }
  const topMerchants = Array.from(merchantMap.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)

  const recentTransactions = transactions.slice(0, 10)

  const noBizAccounts = bizIds.length === 0

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Business P&amp;L</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/business?month=${prevMonth}`}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </Link>
          <span className="text-sm font-medium text-gray-700 min-w-[130px] text-center">
            {formatMonthLabel(selectedMonth)}
          </span>
          <Link
            href={isCurrentMonth ? '#' : `/business?month=${nextMonth}`}
            className={`p-1.5 rounded-lg transition-colors ${
              isCurrentMonth
                ? 'text-gray-300 cursor-default'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <ChevronRightIcon className="h-5 w-5" />
          </Link>
        </div>
      </div>

      {/* No business accounts empty state */}
      {noBizAccounts && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
          <p className="text-gray-500 mb-3">No business accounts configured.</p>
          <Link
            href="/settings/accounts"
            className="text-sm font-medium text-emerald-600 hover:text-emerald-700 underline"
          >
            Go to Settings → Accounts to set account scopes
          </Link>
        </div>
      )}

      {!noBizAccounts && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Revenue</p>
              <p className="text-2xl font-bold text-emerald-600">{fmt(revenue)}</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Expenses</p>
              <p className="text-2xl font-bold text-red-500">{fmt(expenses)}</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Net Profit</p>
              <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {fmt(netProfit)}
              </p>
            </div>
          </div>

          {/* Category breakdown + Top merchants */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Category breakdown */}
            <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Expenses by Category</h2>
              </div>
              {byCategory.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">No expenses this month</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {byCategory.map(({ category, amount }) => (
                      <tr key={category} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-700">{category}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-900">{fmt(amount)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-400 text-xs w-16">
                          {expenses > 0 ? `${Math.round((amount / expenses) * 100)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Top merchants */}
            <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Top Merchants by Spend</h2>
              </div>
              {topMerchants.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">No expenses this month</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {topMerchants.map(({ name, amount }, i) => (
                      <tr key={name} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-400 w-6 text-xs">{i + 1}</td>
                        <td className="px-4 py-2.5 text-gray-700 truncate max-w-[160px]">{name}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-900">{fmt(amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Recent transactions */}
          <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Recent Transactions</h2>
              <Link
                href={`/transactions?scope=business`}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
              >
                View all
              </Link>
            </div>
            {recentTransactions.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">No transactions this month</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {recentTransactions.map(t => (
                    <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-400 text-xs w-20">{formatDate(t.date)}</td>
                      <td className="px-4 py-2.5 text-gray-700 truncate max-w-[200px]">
                        {t.description || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">{t.category || '—'}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${t.amount >= 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
                        {fmt(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
