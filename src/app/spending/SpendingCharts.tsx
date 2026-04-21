'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SpendingSummary } from '@/lib/types'
import { CATEGORIES } from '@/lib/constants'
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'

const COLORS = [
  '#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0',
  '#f59e0b', '#fbbf24', '#fcd34d', '#fde68a',
  '#3b82f6', '#60a5fa', '#93c5fd',
  '#8b5cf6', '#a78bfa', '#c4b5fd',
  '#ef4444', '#f87171', '#fca5a5',
  '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb',
]

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

function formatMonth(m: string): string {
  const [year, month] = m.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

function prevMonth(m: string): string {
  const [year, month] = m.split('-').map(Number)
  const d = new Date(year, month - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nextMonth(m: string): string {
  const [year, month] = m.split('-').map(Number)
  const d = new Date(year, month, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface BudgetRow {
  category: string
  monthly_limit: number
}

interface UncategorisedMerchant {
  merchant: string
  total: number
  count: number
}

interface Props {
  currentSummary: SpendingSummary[]
  lastSummary: SpendingSummary[]
  threeBackSummary: SpendingSummary[]
  currentTotal: number
  lastTotal: number
  lastSameDayTotal: number
  comparisonLabel: string
  incomeTotal: number
  netTotal: number
  dailyRate: number
  projected: number
  selectedMonth: string
  isCurrentMonth: boolean
  daysElapsed: number
  daysInMonth: number
  budgets: BudgetRow[]
  uncategorisedMerchants: UncategorisedMerchant[]
}

export function SpendingCharts({
  currentSummary,
  lastSummary,
  threeBackSummary,
  currentTotal,
  lastTotal,
  lastSameDayTotal,
  comparisonLabel,
  incomeTotal,
  netTotal,
  dailyRate,
  projected,
  selectedMonth,
  isCurrentMonth,
  daysElapsed,
  daysInMonth,
  budgets,
  uncategorisedMerchants,
}: Props) {
  const router = useRouter()
  const [showCategoriseModal, setShowCategoriseModal] = useState(false)
  const [merchantCategories, setMerchantCategories] = useState<Record<string, string>>({})
  const [savingMerchant, setSavingMerchant] = useState<string | null>(null)
  const today = new Date()
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const isLatestMonth = selectedMonth === currentMonthStr

  const comparisonBase = isCurrentMonth ? lastSameDayTotal : lastTotal
  const changePercent = comparisonBase > 0 ? ((currentTotal - comparisonBase) / comparisonBase) * 100 : 0

  async function handleSaveMapping(merchant: string) {
    const category = merchantCategories[merchant]
    if (!category) return
    setSavingMerchant(merchant)
    try {
      await fetch('/api/mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant, category }),
      })
    } finally {
      setSavingMerchant(null)
    }
  }

  async function handleSaveAllMappings() {
    const merchants = Object.keys(merchantCategories).filter(m => merchantCategories[m])
    for (const merchant of merchants) {
      await handleSaveMapping(merchant)
    }
    setShowCategoriseModal(false)
    router.refresh()
  }

  // Build category comparison bar data
  const allCategories = Array.from(
    new Set([
      ...currentSummary.map(s => s.category),
      ...lastSummary.map(s => s.category),
    ])
  )
  const barData = allCategories.map(cat => ({
    category: cat,
    current: currentSummary.find(s => s.category === cat)?.amount || 0,
    last: lastSummary.find(s => s.category === cat)?.amount || 0,
    threeBack: threeBackSummary.find(s => s.category === cat)?.amount || 0,
  })).filter(d => d.current > 0 || d.last > 0).sort((a, b) => b.current - a.current).slice(0, 12)

  return (
    <div className="space-y-6">
      {/* Month navigation */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push(`/spending?month=${prevMonth(selectedMonth)}`)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          &larr; Prev
        </button>
        <h2 className="text-lg font-semibold text-gray-900 flex-1 text-center">{formatMonth(selectedMonth)}</h2>
        <button
          onClick={() => router.push(`/spending?month=${nextMonth(selectedMonth)}`)}
          disabled={isLatestMonth}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Next &rarr;
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500">Income</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(incomeTotal)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500">Total spent</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(currentTotal)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500">Net</div>
          <div className={`text-2xl font-bold mt-1 ${netTotal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(netTotal)}
          </div>
          <div className="text-xs text-gray-400">{netTotal >= 0 ? 'surplus' : 'deficit'}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500">{comparisonLabel}</div>
          <div className={`text-2xl font-bold mt-1 ${changePercent > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {changePercent > 0 ? '+' : ''}{changePercent.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-400">{formatCurrency(comparisonBase)} prior period</div>
        </div>
      </div>

      {/* Daily rate & projection (current month only) */}
      {isCurrentMonth && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm text-gray-500">Daily rate</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(dailyRate)}</div>
            <div className="text-xs text-gray-400">{daysElapsed} of {daysInMonth} days</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm text-gray-500">Projected total</div>
            <div className="text-2xl font-bold text-amber-600 mt-1">{formatCurrency(projected)}</div>
            <div className="text-xs text-gray-400">at current rate</div>
          </div>
        </div>
      )}

      {currentSummary.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
          No spending data for {formatMonth(selectedMonth)}.
        </div>
      ) : (
        <>
          {/* Budget progress bars (H-034) */}
          {budgets.length > 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">Budget vs Actual</h3>
                <a href="/settings/budgets" className="text-xs text-emerald-700 hover:underline">Manage budgets →</a>
              </div>
              <div className="space-y-3">
                {budgets.map(b => {
                  const spent = currentSummary.find(s => s.category === b.category)?.amount || 0
                  const pct = b.monthly_limit > 0 ? (spent / b.monthly_limit) * 100 : 0
                  const barColour = pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
                  return (
                    <div key={b.category}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-700">{b.category}</span>
                        <span className={`font-medium ${pct >= 100 ? 'text-red-600' : pct >= 75 ? 'text-amber-600' : 'text-gray-700'}`}>
                          {formatCurrency(spent)} / {formatCurrency(b.monthly_limit)}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColour}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      {pct >= 100 && (
                        <p className="text-xs text-red-600 mt-0.5">Over budget by {formatCurrency(spent - b.monthly_limit)}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
              <a href="/settings/budgets" className="text-sm text-emerald-700 hover:underline">
                Set budgets to track your spending limits →
              </a>
            </div>
          )}

          {/* Quick categorise prompt */}
          {uncategorisedMerchants.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
              <span className="text-sm text-amber-800">
                {uncategorisedMerchants.reduce((s, m) => s + m.count, 0)} uncategorised transactions this month
              </span>
              <button
                onClick={() => setShowCategoriseModal(true)}
                className="text-sm font-medium text-amber-700 hover:text-amber-900 underline"
              >
                Fix uncategorised →
              </button>
            </div>
          )}

          {/* Charts row */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Pie chart */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Spending by category</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={currentSummary}
                    dataKey="amount"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={50}
                    cursor="pointer"
                    onClick={(data) => {
                      if (data?.name) router.push(`/transactions?category=${encodeURIComponent(data.name)}`)
                    }}
                  >
                    {currentSummary.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value) => formatCurrency(Number(value ?? 0))}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Category list */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Top categories</h3>
              <div className="space-y-2 overflow-y-auto max-h-[280px] pr-1">
                {currentSummary.map((s, i) => (
                  <button
                    key={s.category}
                    onClick={() => router.push(`/transactions?category=${encodeURIComponent(s.category)}`)}
                    className="flex items-center gap-3 w-full text-left hover:bg-gray-50 rounded-lg px-1 transition-colors"
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700 truncate">{s.category}</span>
                        <span className="text-sm font-medium text-gray-900 ml-2">{formatCurrency(s.amount)}</span>
                      </div>
                      <div className="mt-0.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${s.percent}%`, backgroundColor: COLORS[i % COLORS.length] }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 w-10 text-right">{s.percent.toFixed(0)}%</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Month comparison bar chart */}
          {barData.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Month-over-month comparison (top categories)</h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={barData} margin={{ top: 0, right: 10, left: 10, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 11 }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
                    tick={{ fontSize: 11 }}
                  />
                  <RechartsTooltip formatter={(value) => formatCurrency(Number(value ?? 0))} />
                  <Legend verticalAlign="top" />
                  <Bar dataKey="current" name={formatMonth(selectedMonth)} fill="#059669" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="last" name={formatMonth(prevMonth(selectedMonth))} fill="#6ee7b7" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* Quick categorise modal */}
      {showCategoriseModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Fix uncategorised merchants</h2>
              <button onClick={() => setShowCategoriseModal(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-3">
              {uncategorisedMerchants.map(({ merchant, total, count }) => (
                <div key={merchant} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{merchant}</div>
                    <div className="text-xs text-gray-400">{count} txn{count !== 1 ? 's' : ''} · {formatCurrency(total)}</div>
                  </div>
                  <select
                    value={merchantCategories[merchant] || ''}
                    onChange={e => setMerchantCategories(prev => ({ ...prev, [merchant]: e.target.value }))}
                    className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-40"
                  >
                    <option value="">Select...</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button
                    onClick={() => handleSaveMapping(merchant)}
                    disabled={!merchantCategories[merchant] || savingMerchant === merchant}
                    className="text-xs bg-emerald-700 text-white rounded-lg px-3 py-1.5 disabled:opacity-40 hover:bg-emerald-800 transition-colors"
                  >
                    Save
                  </button>
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowCategoriseModal(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button
                onClick={handleSaveAllMappings}
                className="text-sm bg-emerald-700 text-white rounded-lg px-4 py-2 hover:bg-emerald-800 transition-colors font-medium"
              >
                Save all &amp; refresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
