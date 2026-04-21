import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { SpendingCharts } from './SpendingCharts'
import { SpendingSummary } from '@/lib/types'

function getMonthRange(month: string): { from: string; to: string } {
  const [year, m] = month.split('-').map(Number)
  const from = `${year}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(year, m, 0).getDate()
  const to = `${year}-${String(m).padStart(2, '0')}-${lastDay}`
  return { from, to }
}

function prevMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const d = new Date(year, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function computeSummary(rows: { category: string | null; amount: number }[]): SpendingSummary[] {
  const map: Record<string, { amount: number; count: number }> = {}
  for (const r of rows) {
    const cat = r.category || 'Other'
    if (!map[cat]) map[cat] = { amount: 0, count: 0 }
    map[cat].amount += Math.abs(r.amount)
    map[cat].count += 1
  }
  const total = Object.values(map).reduce((sum, v) => sum + v.amount, 0)
  return Object.entries(map)
    .map(([category, { amount, count }]) => ({
      category,
      amount,
      count,
      percent: total > 0 ? (amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
}

export default async function SpendingPage({
  searchParams,
}: {
  searchParams: { month?: string }
}) {
  const today = new Date()
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const selectedMonth = searchParams.month || currentMonthStr

  const { from, to } = getMonthRange(selectedMonth)
  const lastMonth = prevMonth(selectedMonth)
  const { from: lmFrom, to: lmTo } = getMonthRange(lastMonth)
  const threeMonthsBack = prevMonth(prevMonth(lastMonth))
  const { from: tmFrom, to: tmTo } = getMonthRange(threeMonthsBack)

  // Compute same-day-last-month cutoff for fair mid-month comparison
  const isCurrentMonth = selectedMonth === currentMonthStr
  const lastDayOfPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0).getDate()
  const sameDayLastMonth = Math.min(today.getDate(), lastDayOfPrevMonth)
  const sameDayLastMonthTo = `${lmFrom.slice(0, 8)}${String(sameDayLastMonth).padStart(2, '0')}`
  const comparisonLabel = isCurrentMonth ? 'vs same point last month' : 'vs last month'

  const supabase = createServerClient()

  const [{ data: current }, { data: last }, { data: threeBack }, { data: budgets }, { data: income }, { data: lastSameDay }, { data: uncategorised }] = await Promise.all([
    supabase
      .from('transactions')
      .select('category, amount')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('is_transfer', false)
      .lt('amount', 0)
      .gte('date', from)
      .lte('date', to),
    supabase
      .from('transactions')
      .select('category, amount')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('is_transfer', false)
      .lt('amount', 0)
      .gte('date', lmFrom)
      .lte('date', lmTo),
    supabase
      .from('transactions')
      .select('category, amount')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('is_transfer', false)
      .lt('amount', 0)
      .gte('date', tmFrom)
      .lte('date', tmTo),
    supabase
      .from('budgets')
      .select('category, monthly_limit')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID),
    supabase
      .from('transactions')
      .select('amount')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('is_transfer', false)
      .gt('amount', 0)
      .gte('date', from)
      .lte('date', to),
    supabase
      .from('transactions')
      .select('category, amount')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('is_transfer', false)
      .lt('amount', 0)
      .gte('date', lmFrom)
      .lte('date', sameDayLastMonthTo),
    supabase
      .from('transactions')
      .select('merchant, amount')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('is_transfer', false)
      .is('category', null)
      .lt('amount', 0)
      .gte('date', from)
      .lte('date', to),
  ])

  const currentSummary = computeSummary(current || [])
  const lastSummary = computeSummary(last || [])
  const threeBackSummary = computeSummary(threeBack || [])

  const currentTotal = currentSummary.reduce((s, c) => s + c.amount, 0)
  const lastTotal = lastSummary.reduce((s, c) => s + c.amount, 0)
  const lastSameDayTotal = (lastSameDay || []).reduce((s, t) => s + Math.abs(t.amount), 0)
  const incomeTotal = (income || []).reduce((s, t) => s + (t as { amount: number }).amount, 0)
  const netTotal = incomeTotal - currentTotal

  // Daily spend rate / projection
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const daysElapsed = isCurrentMonth ? today.getDate() : daysInMonth
  const dailyRate = daysElapsed > 0 ? currentTotal / daysElapsed : 0
  const projected = dailyRate * daysInMonth

  // Uncategorised merchants grouped
  const merchantMap: Record<string, { total: number; count: number }> = {}
  for (const t of uncategorised || []) {
    const m = (t as { merchant: string | null; amount: number }).merchant || 'Unknown'
    if (!merchantMap[m]) merchantMap[m] = { total: 0, count: 0 }
    merchantMap[m].total += Math.abs((t as { amount: number }).amount)
    merchantMap[m].count += 1
  }
  const uncategorisedMerchants = Object.entries(merchantMap)
    .map(([merchant, { total, count }]) => ({ merchant, total, count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Spending</h1>
      </div>
      <SpendingCharts
        currentSummary={currentSummary}
        lastSummary={lastSummary}
        threeBackSummary={threeBackSummary}
        currentTotal={currentTotal}
        lastTotal={lastTotal}
        lastSameDayTotal={lastSameDayTotal}
        comparisonLabel={comparisonLabel}
        incomeTotal={incomeTotal}
        netTotal={netTotal}
        dailyRate={dailyRate}
        projected={projected}
        selectedMonth={selectedMonth}
        isCurrentMonth={isCurrentMonth}
        daysElapsed={daysElapsed}
        daysInMonth={daysInMonth}
        budgets={budgets || []}
        uncategorisedMerchants={uncategorisedMerchants}
      />
    </div>
  )
}
