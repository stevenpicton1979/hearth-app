import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { detectSubscriptions } from '@/lib/subscriptionDetector'
import Link from 'next/link'
import { Transaction } from '@/lib/types'
import {
  ArrowUpTrayIcon,
  BanknotesIcon,
  FlagIcon,
  CalendarIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline'
import { BusinessSummaryWidget } from './BusinessSummaryWidget'

const aud = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)

const audFull = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(n)

function formatDate(s: string): string {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
}

function getDeltaLabel(current: number, previous: number, label = 'vs same point last month'): { label: string; positive: boolean } | null {
  if (previous === 0) return null
  const delta = current - previous
  const pct = Math.abs((delta / Math.abs(previous)) * 100).toFixed(0)
  return {
    label: `${delta >= 0 ? '+' : ''}${aud(delta)} (${pct}%) ${label}`,
    positive: delta >= 0,
  }
}

export default async function DashboardPage() {
  const supabase = createServerClient()
  const now = new Date()
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthStart = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

  // Same-day-last-month for fair comparison
  const lastDayOfPrevMonth = prevMonthEnd.getDate()
  const sameDayPrevMonthDay = Math.min(now.getDate(), lastDayOfPrevMonth)
  const sameDayPrevMonth = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-${String(sameDayPrevMonthDay).padStart(2, '0')}`

  const { data: allAccounts } = await supabase
    .from('accounts')
    .select('id, display_name, current_balance, scope')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_active', true)

  const householdIds = (allAccounts || [])
    .filter(a => !(a as { scope: string | null }).scope || (a as { scope: string | null }).scope === 'household')
    .map(a => a.id)

  const [
    { data: assets },
    { data: liabilities },
    { data: snapshots },
    { data: thisMonthTxns },
    { data: prevMonthTxns },
    { data: budgets },
    { data: goals },
    { data: recentTxns },
    { data: subTxns },
    { data: thisMonthIncomeTxns },
  ] = await Promise.all([
    supabase.from('assets').select('value').eq('household_id', DEFAULT_HOUSEHOLD_ID),
    supabase.from('liabilities').select('balance').eq('household_id', DEFAULT_HOUSEHOLD_ID),
    supabase.from('net_worth_snapshots').select('*').eq('household_id', DEFAULT_HOUSEHOLD_ID).order('recorded_at', { ascending: false }).limit(2),
    (householdIds.length > 0
      ? supabase.from('transactions').select('amount, category').eq('household_id', DEFAULT_HOUSEHOLD_ID).eq('is_transfer', false).gte('date', thisMonthStart).lt('amount', 0).in('account_id', householdIds)
      : supabase.from('transactions').select('amount, category').eq('household_id', DEFAULT_HOUSEHOLD_ID).eq('is_transfer', false).gte('date', thisMonthStart).lt('amount', 0)),
    (householdIds.length > 0
      ? supabase.from('transactions').select('amount').eq('household_id', DEFAULT_HOUSEHOLD_ID).eq('is_transfer', false).gte('date', prevMonthStart).lte('date', sameDayPrevMonth).lt('amount', 0).in('account_id', householdIds)
      : supabase.from('transactions').select('amount').eq('household_id', DEFAULT_HOUSEHOLD_ID).eq('is_transfer', false).gte('date', prevMonthStart).lte('date', sameDayPrevMonth).lt('amount', 0)),
    supabase.from('budgets').select('*').eq('household_id', DEFAULT_HOUSEHOLD_ID),
    supabase.from('goals').select('*').eq('household_id', DEFAULT_HOUSEHOLD_ID).eq('is_complete', false).order('created_at', { ascending: false }).limit(3),
    supabase.from('transactions').select('id, date, merchant, description, amount, category, classification, accounts(display_name)').eq('household_id', DEFAULT_HOUSEHOLD_ID).eq('is_transfer', false).order('date', { ascending: false }).limit(5),
    supabase.from('transactions').select('*').eq('household_id', DEFAULT_HOUSEHOLD_ID).eq('is_transfer', false).lt('amount', 0).order('date', { ascending: false }).limit(2000),
    (householdIds.length > 0
      ? supabase.from('transactions').select('amount').eq('household_id', DEFAULT_HOUSEHOLD_ID).eq('is_transfer', false).gt('amount', 0).gte('date', thisMonthStart).in('account_id', householdIds)
      : supabase.from('transactions').select('amount').eq('household_id', DEFAULT_HOUSEHOLD_ID).eq('is_transfer', false).gt('amount', 0).gte('date', thisMonthStart)),
  ])

  const { data: manualIncome } = await supabase
    .from('manual_income_entries')
    .select('amount')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .gte('date', thisMonthStart)

  // Business accounts data (only if any business-scoped accounts exist)
  const businessAccounts = (allAccounts || []).filter(a => (a as { scope: string | null }).scope === 'business')
  const businessIds = businessAccounts.map(a => a.id)

  const businessBalance = businessAccounts.reduce((s, a) => s + ((a as { current_balance: number | null }).current_balance || 0), 0)

  let businessRevenue = 0
  let businessOutgoings = 0
  if (businessIds.length > 0) {
    const qBizRev = supabase.from('transactions').select('amount').eq('household_id', DEFAULT_HOUSEHOLD_ID).eq('is_transfer', false).gt('amount', 0).gte('date', thisMonthStart).in('account_id', businessIds)
    const qBizOut = supabase.from('transactions').select('amount').eq('household_id', DEFAULT_HOUSEHOLD_ID).eq('is_transfer', false).lt('amount', 0).gte('date', thisMonthStart).in('account_id', businessIds)
    const [{ data: bizRev }, { data: bizOut }] = await Promise.all([qBizRev, qBizOut])
    businessRevenue = (bizRev || []).reduce((s, t) => s + (t as { amount: number }).amount, 0)
    businessOutgoings = (bizOut || []).reduce((s, t) => s + Math.abs((t as { amount: number }).amount), 0)
  }

  const accounts = allAccounts

  // Net worth
  const bankBalance = (accounts || []).reduce((s, a) => s + ((a as { current_balance: number | null }).current_balance || 0), 0)
  const manualAssets = (assets || []).reduce((s, a) => s + (a as { value: number }).value, 0)
  const totalAssets = manualAssets + bankBalance
  const totalLiabilities = (liabilities || []).reduce((s, l) => s + (l as { balance: number }).balance, 0)
  const netWorth = totalAssets - totalLiabilities
  const latestSnapshot = snapshots?.[0] ?? null
  const prevSnapshot = snapshots?.[1] ?? null
  const netWorthDelta = latestSnapshot && prevSnapshot
    ? getDeltaLabel(latestSnapshot.net_worth, prevSnapshot.net_worth)
    : null

  // Spending
  const thisMonthSpend = (thisMonthTxns || []).reduce((s, t) => s + Math.abs((t as { amount: number }).amount), 0)
  const prevMonthSpend = (prevMonthTxns || []).reduce((s, t) => s + Math.abs((t as { amount: number }).amount), 0)
  const spendDelta = getDeltaLabel(thisMonthSpend, prevMonthSpend)
  const totalBudget = (budgets || []).reduce((s, b) => s + (b as { monthly_limit: number }).monthly_limit, 0)

  // Income & savings (transactions + manual income entries)
  const txIncome = (thisMonthIncomeTxns || []).reduce((s, t) => s + (t as { amount: number }).amount, 0)
  const manualIncomeTotal = (manualIncome || []).reduce((s, e) => s + (e as { amount: number }).amount, 0)
  const thisMonthIncome = txIncome + manualIncomeTotal
  const netSurplus = thisMonthIncome - thisMonthSpend
  const savingsRate = thisMonthIncome > 0 ? (netSurplus / thisMonthIncome) * 100 : null

  // Per-category spend for budget widget
  const categorySpend: Record<string, number> = {}
  for (const t of thisMonthTxns || []) {
    const cat = (t as { category: string | null; amount: number }).category || 'Other'
    categorySpend[cat] = (categorySpend[cat] || 0) + Math.abs((t as { amount: number }).amount)
  }
  // Top 3 budget categories by utilisation ratio
  const budgetProgress = (budgets || [])
    .map(b => {
      const spent = categorySpend[(b as { category: string }).category] || 0
      const limit = (b as { monthly_limit: number }).monthly_limit
      return { category: (b as { category: string }).category, spent, limit, ratio: limit > 0 ? spent / limit : 0 }
    })
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3)

  // Subscriptions — upcoming in next 7 days
  const detected = detectSubscriptions((subTxns || []) as Transaction[], accounts || [])
  const sevenDaysFromNow = new Date()
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
  const upcoming = detected
    .filter(s => !s.is_lapsed && new Date(s.next_expected) <= sevenDaysFromNow)
    .sort((a, b) => a.next_expected.localeCompare(b.next_expected))
  const upcomingTotal = upcoming.reduce((s, sub) => s + sub.amount, 0)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          {now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Net Worth card */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Net Worth</h2>
            <Link href="/net-worth" className="text-xs text-emerald-700 hover:text-emerald-900 flex items-center gap-1">
              Details <ArrowRightIcon className="h-3 w-3" />
            </Link>
          </div>
          <p className={`text-3xl font-bold ${netWorth >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {aud(netWorth)}
          </p>
          {netWorthDelta && (
            <p className={`text-xs mt-1 ${netWorthDelta.positive ? 'text-emerald-600' : 'text-red-500'}`}>
              {netWorthDelta.label}
            </p>
          )}
          <div className="flex gap-4 mt-4 text-sm text-gray-500">
            <div>
              <span className="text-xs text-gray-400 block">Assets</span>
              <span className="font-medium text-gray-800">{aud(totalAssets)}</span>
            </div>
            <div>
              <span className="text-xs text-gray-400 block">Liabilities</span>
              <span className="font-medium text-red-600">{aud(totalLiabilities)}</span>
            </div>
          </div>
          {latestSnapshot && (
            <p className="text-xs text-gray-400 mt-3">
              Snapshot from {new Date(latestSnapshot.recorded_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </p>
          )}
        </div>

        {/* This month spending card */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">This Month</h2>
            <Link href="/spending" className="text-xs text-emerald-700 hover:text-emerald-900 flex items-center gap-1">
              Details <ArrowRightIcon className="h-3 w-3" />
            </Link>
          </div>

          {/* Income / Spent / Net */}
          <div className="flex gap-4 mb-3">
            <div className="flex-1">
              <span className="text-xs text-gray-400 block">Income</span>
              <span className="font-semibold text-emerald-700">{aud(thisMonthIncome)}</span>
            </div>
            <div className="flex-1">
              <span className="text-xs text-gray-400 block">Spent</span>
              <span className="font-semibold text-gray-900">{aud(thisMonthSpend)}</span>
            </div>
            <div className="flex-1">
              <span className="text-xs text-gray-400 block">Cash Flow</span>
              <span className={`font-semibold ${netSurplus >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{aud(netSurplus)}</span>
            </div>
          </div>

          {/* Net surplus/deficit prominent figure */}
          <p className={`text-3xl font-bold ${netSurplus >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{aud(netSurplus)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{netSurplus >= 0 ? 'surplus' : 'deficit'} this month</p>

          {spendDelta && (
            <p className={`text-xs mt-1 ${spendDelta.positive ? 'text-red-500' : 'text-emerald-600'}`}>
              {spendDelta.label}
            </p>
          )}

          {/* Savings rate */}
          {savingsRate !== null && (
            <p className={`text-xs font-medium mt-1 ${savingsRate >= 20 ? 'text-emerald-600' : savingsRate >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
              Savings rate: {savingsRate.toFixed(0)}%
            </p>
          )}

          {/* Total budget progress */}
          {totalBudget > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Budget used</span>
                <span>{aud(thisMonthSpend)} / {aud(totalBudget)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    thisMonthSpend > totalBudget ? 'bg-red-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, (thisMonthSpend / totalBudget) * 100)}%` }}
                />
              </div>

              {/* Top 3 budget categories */}
              {budgetProgress.length > 0 && (
                <div className="mt-3 space-y-2">
                  {budgetProgress.map(({ category, spent, limit, ratio }) => {
                    const pct = ratio * 100
                    const barColor = pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
                    return (
                      <div key={category}>
                        <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                          <span>{category}</span>
                          <span className={pct >= 100 ? 'text-red-600' : pct >= 75 ? 'text-amber-600' : ''}>{aud(spent)} / {aud(limit)}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          {totalBudget === 0 && (
            <p className="text-xs text-gray-400 mt-3">
              <Link href="/settings/budgets" className="text-emerald-700 hover:underline">Set budgets</Link> to track progress.
            </p>
          )}
        </div>

        {/* Upcoming subscriptions */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Upcoming Subscriptions</h2>
            <Link href="/subscriptions" className="text-xs text-emerald-700 hover:text-emerald-900 flex items-center gap-1">
              All <ArrowRightIcon className="h-3 w-3" />
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <CalendarIcon className="h-8 w-8 text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No subscriptions due in the next 7 days.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {upcoming.map(sub => (
                  <div key={sub.merchant} className="flex items-center justify-between py-1">
                    <div>
                      <span className="text-sm font-medium text-gray-800">{sub.merchant}</span>
                      <span className="text-xs text-gray-400 ml-2">{formatDate(sub.next_expected)}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">{audFull(sub.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
                <span className="text-gray-500">Total due this week</span>
                <span className="font-semibold text-gray-900">{audFull(upcomingTotal)}</span>
              </div>
            </>
          )}
        </div>

        {/* Goals progress */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Goals</h2>
            <Link href="/goals" className="text-xs text-emerald-700 hover:text-emerald-900 flex items-center gap-1">
              All <ArrowRightIcon className="h-3 w-3" />
            </Link>
          </div>
          {!goals || goals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <FlagIcon className="h-8 w-8 text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No goals set yet.</p>
              <Link href="/goals" className="text-xs text-emerald-700 hover:underline mt-1">Add your first goal</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {(goals || []).map(goal => {
                const current = goal.linked_account_id
                  ? (accounts || []).find(a => (a as { id: string }).id === goal.linked_account_id)?.current_balance ?? goal.current_amount
                  : goal.current_amount
                const pct = goal.target_amount > 0 ? Math.min(100, (current / goal.target_amount) * 100) : 0
                return (
                  <div key={goal.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-800">
                        {goal.emoji && <span className="mr-1">{goal.emoji}</span>}
                        {goal.name}
                      </span>
                      <span className="text-gray-500">{aud(current)} / {aud(goal.target_amount)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent transactions */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Recent Transactions</h2>
            <Link href="/transactions" className="text-xs text-emerald-700 hover:text-emerald-900 flex items-center gap-1">
              All <ArrowRightIcon className="h-3 w-3" />
            </Link>
          </div>
          {!recentTxns || recentTxns.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No transactions yet. Import your first CSV.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {(recentTxns || []).map(t => (
                <div key={t.id} className="flex items-center justify-between py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{t.merchant || t.description}</span>
                      {t.category && (
                        <span className="hidden sm:inline-flex px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full flex-shrink-0">
                          {t.category}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {formatDate(t.date)}
                      {t.accounts?.[0]?.display_name && <span className="ml-2">{t.accounts[0].display_name}</span>}
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ml-4 flex-shrink-0 ${t.amount < 0 ? 'text-gray-900' : 'text-emerald-700'}`}>
                    {t.amount < 0 ? '-' : '+'}{audFull(Math.abs(t.amount))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 md:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/import"
              className="flex items-center gap-2 border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
            >
              <ArrowUpTrayIcon className="h-4 w-4 text-emerald-700" />
              Import CSV
            </Link>
            <Link
              href="/settings/accounts"
              className="flex items-center gap-2 border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
            >
              <BanknotesIcon className="h-4 w-4 text-emerald-700" />
              Manage Accounts
            </Link>
            <Link
              href="/goals"
              className="flex items-center gap-2 border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
            >
              <FlagIcon className="h-4 w-4 text-emerald-700" />
              Manage Goals
            </Link>
            <Link
              href="/net-worth"
              className="flex items-center gap-2 border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
            >
              <span className="text-emerald-700 font-bold text-base leading-none">$</span>
              Net Worth
            </Link>
          </div>
        </div>

        {/* Business summary — only rendered when business-scoped accounts exist */}
        {businessAccounts.length > 0 && (
          <BusinessSummaryWidget
            balance={businessBalance}
            revenue={businessRevenue}
            outgoings={businessOutgoings}
            accountCount={businessAccounts.length}
          />
        )}
      </div>
    </div>
  )
}
