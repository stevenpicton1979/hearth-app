'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { CATEGORIES, CLASSIFICATIONS } from '@/lib/constants'
import { Transaction } from '@/lib/types'
import { MagnifyingGlassIcon, EllipsisHorizontalIcon, XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

interface Props {
  initialTransactions: Transaction[]
  accounts: { id: string; display_name: string }[]
}

function rowBg(t: Transaction): string {
  if (t.is_transfer) return 'bg-gray-50 text-gray-400'
  if (!t.category) return 'bg-amber-50'
  if (!t.classification) return 'bg-green-50'
  return 'bg-white'
}

function formatAmount(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
}

function formatDate(s: string): string {
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function TransactionTable({ initialTransactions, accounts }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions)
  const [count, setCount] = useState<number>(initialTransactions.length)
  const [page, setPage] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  // Filters
  const [filterAccount, setFilterAccount] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterClassification, setFilterClassification] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [showTransfers, setShowTransfers] = useState(false)

  // Inline editing
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<'category' | 'classification' | null>(null)

  // Bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState('')
  const [bulkValue, setBulkValue] = useState('')

  // Action menu
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const fetchTransactions = useCallback(async (p: number) => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterAccount) params.set('account', filterAccount)
      if (filterCategory) params.set('category', filterCategory)
      if (filterClassification) params.set('classification', filterClassification)
      if (filterFrom) params.set('from', filterFrom)
      if (filterTo) params.set('to', filterTo)
      if (filterSearch) params.set('search', filterSearch)
      if (showTransfers) params.set('show_transfers', 'true')
      params.set('page', String(p))
      const res = await fetch(`/api/transactions?${params}`)
      const data = await res.json()
      setTransactions(data.transactions || [])
      setCount(data.count || 0)
    } finally {
      setIsLoading(false)
    }
  }, [filterAccount, filterCategory, filterClassification, filterFrom, filterTo, filterSearch, showTransfers])

  useEffect(() => {
    setPage(0)
    setSelectedIds(new Set())
  }, [filterAccount, filterCategory, filterClassification, filterFrom, filterTo, filterSearch, showTransfers])

  useEffect(() => {
    fetchTransactions(page)
  }, [fetchTransactions, page])

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleCategoryChange = async (id: string, field: 'category' | 'classification', value: string) => {
    setEditingId(null)
    setEditingField(null)
    const body: Record<string, string | null> = {}
    body[field] = value || null
    await fetch(`/api/transactions/${id}/categorise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    fetchTransactions(page)
  }

  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return
    await fetch('/api/transactions/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds), action: bulkAction, value: bulkValue }),
    })
    setSelectedIds(new Set())
    setBulkAction('')
    setBulkValue('')
    fetchTransactions(page)
  }

  const handleExclude = async (id: string) => {
    setMenuOpenId(null)
    await fetch('/api/transactions/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], action: 'exclude' }),
    })
    fetchTransactions(page)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(transactions.map(t => t.id)))
    }
  }

  const totalPages = Math.ceil(count / 50)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="relative col-span-2 md:col-span-1">
            <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search merchant..."
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Account */}
          <select
            value={filterAccount}
            onChange={e => setFilterAccount(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}
          </select>

          {/* Category */}
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All categories</option>
            <option value="__uncategorised">Uncategorised</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Classification */}
          <select
            value={filterClassification}
            onChange={e => setFilterClassification(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All classifications</option>
            {CLASSIFICATIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Date from */}
          <input
            type="date"
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />

          {/* Date to */}
          <input
            type="date"
            value={filterTo}
            onChange={e => setFilterTo(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center justify-between mt-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showTransfers}
              onChange={e => setShowTransfers(e.target.checked)}
              className="rounded text-emerald-600"
            />
            Show excluded / transfers
          </label>
          <span className="text-sm text-gray-400">{count} transactions</span>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="bg-emerald-700 text-white rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <select
              value={bulkAction}
              onChange={e => { setBulkAction(e.target.value); setBulkValue('') }}
              className="text-sm bg-emerald-800 text-white border border-emerald-600 rounded-lg px-3 py-1.5 focus:outline-none"
            >
              <option value="">Choose action...</option>
              <option value="set_category">Set category</option>
              <option value="set_classification">Set classification</option>
              <option value="exclude">Exclude from reports</option>
            </select>
            {bulkAction === 'set_category' && (
              <select
                value={bulkValue}
                onChange={e => setBulkValue(e.target.value)}
                className="text-sm bg-emerald-800 text-white border border-emerald-600 rounded-lg px-3 py-1.5 focus:outline-none"
              >
                <option value="">Select category...</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {bulkAction === 'set_classification' && (
              <select
                value={bulkValue}
                onChange={e => setBulkValue(e.target.value)}
                className="text-sm bg-emerald-800 text-white border border-emerald-600 rounded-lg px-3 py-1.5 focus:outline-none"
              >
                <option value="">Select classification...</option>
                {CLASSIFICATIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <button
              onClick={handleBulkAction}
              disabled={!bulkAction || (bulkAction !== 'exclude' && !bulkValue)}
              className="bg-white text-emerald-800 text-sm font-medium rounded-lg px-4 py-1.5 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply
            </button>
          </div>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No transactions found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === transactions.length && transactions.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded text-emerald-600"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Merchant</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Account</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Classification</th>
                  <th className="w-10 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map(t => (
                  <tr key={t.id} className={`${rowBg(t)} hover:bg-opacity-80 transition-colors`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                        className="rounded text-emerald-600"
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(t.date)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 truncate max-w-[200px]">{t.merchant}</div>
                      {t.notes && <div className="text-xs text-gray-400 truncate max-w-[200px]">{t.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      {accounts.find(a => a.id === t.account_id)?.display_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-gray-900">
                      {formatAmount(t.amount)}
                    </td>

                    {/* Category cell - inline edit */}
                    <td className="px-4 py-3">
                      {editingId === t.id && editingField === 'category' ? (
                        <select
                          autoFocus
                          defaultValue={t.category || ''}
                          onBlur={e => handleCategoryChange(t.id, 'category', e.target.value)}
                          onChange={e => handleCategoryChange(t.id, 'category', e.target.value)}
                          className="text-sm border border-emerald-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                        >
                          <option value="">Uncategorised</option>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <button
                          onClick={() => { setEditingId(t.id); setEditingField('category') }}
                          className={`text-left text-sm rounded px-2 py-0.5 hover:bg-white hover:shadow-sm transition-all ${
                            t.category ? 'text-gray-700' : 'text-amber-600 italic'
                          }`}
                        >
                          {t.category || 'Set category'}
                        </button>
                      )}
                    </td>

                    {/* Classification cell - inline edit */}
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {editingId === t.id && editingField === 'classification' ? (
                        <select
                          autoFocus
                          defaultValue={t.classification || ''}
                          onBlur={e => handleCategoryChange(t.id, 'classification', e.target.value)}
                          onChange={e => handleCategoryChange(t.id, 'classification', e.target.value)}
                          className="text-sm border border-emerald-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                        >
                          <option value="">None</option>
                          {CLASSIFICATIONS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : (
                        <button
                          onClick={() => { setEditingId(t.id); setEditingField('classification') }}
                          className={`text-left text-sm rounded px-2 py-0.5 hover:bg-white hover:shadow-sm transition-all ${
                            t.classification ? 'text-gray-600' : 'text-gray-300'
                          }`}
                        >
                          {t.classification || '—'}
                        </button>
                      )}
                    </td>

                    {/* Action menu */}
                    <td className="px-4 py-3 relative">
                      <div ref={menuOpenId === t.id ? menuRef : null}>
                        <button
                          onClick={() => setMenuOpenId(menuOpenId === t.id ? null : t.id)}
                          className="p-1 rounded hover:bg-gray-100 transition-colors"
                        >
                          <EllipsisHorizontalIcon className="h-4 w-4 text-gray-400" />
                        </button>
                        {menuOpenId === t.id && (
                          <div className="absolute right-0 top-8 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-48">
                            <button
                              onClick={() => handleExclude(t.id)}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              Exclude from reports
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
