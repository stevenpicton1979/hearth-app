'use client'

import { useState, useEffect } from 'react'
import { CATEGORIES } from '@/lib/constants'
import { TrashIcon, PlusIcon } from '@heroicons/react/24/outline'

interface Budget {
  id: string
  category: string
  monthly_limit: number
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [addCategory, setAddCategory] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [categoryAverages, setCategoryAverages] = useState<Record<string, number>>({})

  useEffect(() => {
    fetch('/api/budgets')
      .then(r => r.json())
      .then(d => setBudgets(d.budgets || []))
      .finally(() => setIsLoading(false))

    // Fetch 3-month category averages
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth() - 3, 1)
    const to = new Date(now.getFullYear(), now.getMonth(), 0)
    const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`
    const toStr = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, '0')}-${String(to.getDate()).padStart(2, '0')}`
    fetch(`/api/transactions?from=${fromStr}&to=${toStr}&page=0`)
      .then(r => r.json())
      .then(d => {
        // Compute per-category totals over 3 months
        const totals: Record<string, number> = {}
        for (const t of (d.transactions || []) as Array<{ category: string | null; amount: number }>) {
          if (t.amount >= 0) continue // skip income
          const cat = t.category || 'Other'
          totals[cat] = (totals[cat] || 0) + Math.abs(t.amount)
        }
        // Average per month (3 months)
        const avgs: Record<string, number> = {}
        for (const [cat, total] of Object.entries(totals)) {
          avgs[cat] = total / 3
        }
        setCategoryAverages(avgs)
      })
      .catch(() => {/* silently ignore */})
  }, [])

  const usedCategories = new Set(budgets.map(b => b.category))
  const availableCategories = CATEGORIES.filter(c => !usedCategories.has(c))

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addCategory || !addAmount) return setError('Please fill in all fields')
    const monthly_limit = parseFloat(addAmount)
    if (isNaN(monthly_limit) || monthly_limit <= 0) return setError('Amount must be a positive number')

    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: addCategory, monthly_limit }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setBudgets(prev => [...prev, data.budget].sort((a, b) => a.category.localeCompare(b.category)))
      setAddCategory('')
      setAddAmount('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save budget')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (category: string) => {
    await fetch(`/api/budgets?category=${encodeURIComponent(category)}`, { method: 'DELETE' })
    setBudgets(prev => prev.filter(b => b.category !== category))
  }

  const handleLimitChange = async (category: string, newAmount: string) => {
    const monthly_limit = parseFloat(newAmount)
    if (isNaN(monthly_limit) || monthly_limit <= 0) return
    await fetch('/api/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, monthly_limit }),
    })
    setBudgets(prev => prev.map(b => b.category === category ? { ...b, monthly_limit } : b))
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Monthly Budgets</h1>
        <p className="text-sm text-gray-500 mt-1">Set monthly spending limits per category. Progress bars appear on the Spending page.</p>
      </div>

      <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Add budget limit</h2>
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-40">
            <select
              value={addCategory}
              onChange={e => {
                setAddCategory(e.target.value)
                const avg = categoryAverages[e.target.value]
                if (avg && avg > 0) setAddAmount(String(Math.round(avg)))
              }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Select category...</option>
              {availableCategories.map(c => (
                <option key={c} value={c}>
                  {c}{categoryAverages[c] ? ` (avg $${Math.round(categoryAverages[c])}/mo)` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-sm text-gray-400">$</span>
            <input
              type="number"
              min="1"
              step="1"
              placeholder="Amount/month"
              value={addAmount}
              onChange={e => setAddAmount(e.target.value)}
              className="pl-7 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 w-36"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 transition-colors"
          >
            <PlusIcon className="h-4 w-4" />
            Add
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        {Object.keys(categoryAverages).length > 0 && (
          <p className="text-xs text-gray-400 mt-2">Averages based on your last 3 months of spending.</p>
        )}
      </form>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
        ) : budgets.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No budgets set yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Monthly limit</th>
                <th className="w-10 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {budgets.map(b => (
                <tr key={b.category} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{b.category}</td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      min="1"
                      defaultValue={b.monthly_limit}
                      onBlur={e => handleLimitChange(b.category, e.target.value)}
                      className="text-sm text-right border border-gray-200 rounded px-2 py-1 w-28 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(b.category)}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-700">Total monthly budgeted</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                  {formatCurrency(budgets.reduce((s, b) => s + b.monthly_limit, 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
