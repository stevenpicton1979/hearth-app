'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { CATEGORIES, CLASSIFICATIONS } from '@/lib/constants'
import { Transaction } from '@/lib/types'
import {
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  EllipsisHorizontalIcon,
} from '@heroicons/react/24/outline'

interface Props {
  initialTransactions: Transaction[]
  accounts: { id: string; display_name: string }[]
  initialCategory?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
}

function formatDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function rowBg(t: Transaction) {
  if (t.is_transfer)     return 'bg-gray-50 text-gray-400'
  if (!t.category)       return 'bg-amber-50'
  if (!t.classification) return 'bg-green-50'
  return 'bg-white'
}

// ─── Expanded detail panel ────────────────────────────────────────────────────

function DetailPanel({ t, accountName }: { t: Transaction; accountName: string }) {
  const isCredit    = t.amount > 0
  const fromLabel   = isCredit ? t.merchant : accountName
  const toLabel     = isCredit ? accountName : t.merchant
  const sourceLabel = t.accounts?.institution === 'Xero' ? 'Xero' : 'CSV'

  return (
    <div className="text-xs bg-gray-50 border border-gray-100 rounded p-3">
      <div className="grid gap-x-4 gap-y-1.5" style={{ gridTemplateColumns: '5rem 1fr' }}>
        <span className="text-gray-400 uppercase tracking-wide text-[10px] pt-px">From</span>
        <span className="text-gray-700">{fromLabel}</span>

        <span className="text-gray-400 uppercase tracking-wide text-[10px] pt-px">To</span>
        <span className="text-gray-700 font-medium">{toLabel}</span>

        <span className="text-gray-400 uppercase tracking-wide text-[10px] pt-px">When</span>
        <span className="text-gray-700">{formatDate(t.date)}</span>

        <span className="text-gray-400 uppercase tracking-wide text-[10px] pt-px">Amount</span>
        <span className="flex items-center gap-1.5 text-gray-700">
          {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Math.abs(t.amount))}
          <span className={`font-medium rounded px-1 py-px ${isCredit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {isCredit ? 'CREDIT' : 'DEBIT'}
          </span>
          {t.is_transfer && <span className="font-medium rounded px-1 py-px bg-gray-200 text-gray-500">TRANSFER</span>}
        </span>

        <span className="text-gray-400 uppercase tracking-wide text-[10px] pt-px">Source</span>
        <span className="text-gray-700">{sourceLabel}</span>

        {(t.category || t.classification) && <>
          <span className="text-gray-400 uppercase tracking-wide text-[10px] pt-px">Category</span>
          <span className="text-gray-700">
            {t.category ?? <span className="italic text-amber-500">Uncategorised</span>}
            {t.classification && <span className="ml-1.5 text-gray-400">· {t.classification}</span>}
          </span>
        </>}

        {t.raw_description && <>
          <span className="text-gray-400 uppercase tracking-wide text-[10px] self-start pt-px">Raw</span>
          <span className="text-gray-600 font-mono whitespace-pre-wrap break-all">{t.raw_description}</span>
        </>}

        {t.notes && <>
          <span className="text-gray-400 uppercase tracking-wide text-[10px] self-start pt-px">Notes</span>
          <span className="text-gray-600">{t.notes}</span>
        </>}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TransactionTable({ initialTransactions, accounts, initialCategory }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions)
  const [count, setCount]               = useState<number>(initialTransactions.length)
  const [page, setPage]                 = useState(0)
  const [isLoading, setIsLoading]       = useState(false)
  const [expandedId, setExpandedId]     = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId]     = useState<string | null>(null)

  // Filters
  const [filterAccount, setFilterAccount]               = useState('')
  const [filterCategory, setFilterCategory]             = useState(initialCategory || '')
  const [filterClassification, setFilterClassification] = useState('')
  const [filterFrom, setFilterFrom]                     = useState('')
  const [filterTo, setFilterTo]                         = useState('')
  const [filterSearch, setFilterSearch]                 = useState('')
  const [debouncedSearch, setDebouncedSearch]           = useState('')
  const [showTransfers, setShowTransfers]               = useState(false)
  const [filterAmountMin, setFilterAmountMin]           = useState('')
  const [filterAmountMax, setFilterAmountMax]           = useState('')

  // Sort
  const [sortBy, setSortBy]   = useState<'date' | 'amount' | 'merchant' | 'category'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir(col === 'amount' ? 'asc' : 'desc') }
    setPage(0)
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filterSearch), 300)
    return () => clearTimeout(t)
  }, [filterSearch])

  const fetchTransactions = useCallback(async (p: number) => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterAccount)        params.set('account', filterAccount)
      if (filterCategory)       params.set('category', filterCategory)
      if (filterClassification) params.set('classification', filterClassification)
      if (filterFrom)           params.set('from', filterFrom)
      if (filterTo)             params.set('to', filterTo)
      if (debouncedSearch)      params.set('search', debouncedSearch)
      if (showTransfers)        params.set('show_transfers', 'true')
      if (filterAmountMin)      params.set('amount_min', filterAmountMin)
      if (filterAmountMax)      params.set('amount_max', filterAmountMax)
      params.set('sort_by', sortBy)
      params.set('sort_dir', sortDir)
      params.set('page', String(p))
      const res  = await fetch(`/api/transactions?${params}`)
      const data = await res.json()
      setTransactions(data.transactions || [])
      setCount(data.count || 0)
    } finally {
      setIsLoading(false)
    }
  }, [filterAccount, filterCategory, filterClassification, filterFrom, filterTo,
      debouncedSearch, showTransfers, filterAmountMin, filterAmountMax, sortBy, sortDir])

  useEffect(() => { setPage(0) },
    [filterAccount, filterCategory, filterClassification, filterFrom, filterTo,
     debouncedSearch, showTransfers, filterAmountMin, filterAmountMax, sortBy, sortDir])

  useEffect(() => { fetchTransactions(page) }, [fetchTransactions, page])

  const handleCategoryChange = async (id: string, field: 'category' | 'classification', value: string) => {
    await fetch(`/api/transactions/${id}/categorise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value || null }),
    })
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

  const handleUnexclude = async (id: string) => {
    setMenuOpenId(null)
    await fetch('/api/transactions/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], action: 'unexclude' }),
    })
    fetchTransactions(page)
  }

  const SortIcon = ({ col }: { col: typeof sortBy }) =>
    sortBy === col
      ? (sortDir === 'desc' ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronUpIcon className="h-3 w-3" />)
      : <ChevronDownIcon className="h-3 w-3 opacity-0" />

  const totalPages = Math.ceil(count / 50)

  return (
    <div className="space-y-4">

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="relative col-span-2 md:col-span-2">
            <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input type="text" placeholder="Search merchant..." value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>

          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="">All accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}
          </select>

          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="">All categories</option>
            <option value="__uncategorised">Uncategorised</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={filterClassification} onChange={e => setFilterClassification(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="">All classifications</option>
            {CLASSIFICATIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />

          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />

          <input type="number" placeholder="Min amount" value={filterAmountMin}
            onChange={e => setFilterAmountMin(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input type="number" placeholder="Max amount" value={filterAmountMax}
            onChange={e => setFilterAmountMax(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />

          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={showTransfers} onChange={e => setShowTransfers(e.target.checked)}
              className="rounded text-emerald-600" />
            Show excluded / transfers
          </label>

          <div className="col-span-2 flex justify-end">
            <span className="text-sm text-gray-400 self-center">{count} transactions</span>
          </div>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No transactions found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-4 py-3 font-medium text-gray-600">
                    <button onClick={() => toggleSort('date')} className="flex items-center gap-1 hover:text-gray-900">
                      Date <SortIcon col="date" />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600">
                    <button onClick={() => toggleSort('merchant')} className="flex items-center gap-1 hover:text-gray-900">
                      Merchant <SortIcon col="merchant" />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Account</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">
                    <button onClick={() => toggleSort('amount')} className="flex items-center gap-1 ml-auto hover:text-gray-900">
                      Amount <SortIcon col="amount" />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600">
                    <button onClick={() => toggleSort('category')} className="flex items-center gap-1 hover:text-gray-900">
                      Category <SortIcon col="category" />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Classification</th>
                  <th className="w-8 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map(t => {
                  const accountName = accounts.find(a => a.id === t.account_id)?.display_name || '—'
                  const isExpanded  = expandedId === t.id
                  return (
                    <React.Fragment key={t.id}>
                      <tr className={`${rowBg(t)} transition-colors`}>
                        {/* Date — click to expand */}
                        <td
                          className="px-4 py-3 whitespace-nowrap text-gray-600 cursor-pointer select-none w-32"
                          onClick={() => setExpandedId(isExpanded ? null : t.id)}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-300 text-[10px]">{isExpanded ? '▼' : '▶'}</span>
                            {formatDate(t.date)}
                          </div>
                        </td>

                        {/* Merchant */}
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 truncate max-w-[220px]">{t.merchant}</div>
                          {t.raw_description && t.raw_description !== t.merchant && (
                            <div className="text-xs text-gray-400 font-mono truncate max-w-[260px] mt-0.5" title={t.raw_description}>
                              {t.raw_description}
                            </div>
                          )}
                          <div className="flex gap-1 mt-0.5 flex-wrap">
                            {t.is_transfer && <span className="text-xs bg-gray-200 text-gray-500 rounded px-1.5 py-0.5">Transfer</span>}
                            {!t.is_transfer && t.amount > 0 && <span className="text-xs bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5">Income</span>}
                          </div>
                        </td>

                        {/* Account */}
                        <td className="px-4 py-3 text-gray-500 hidden md:table-cell whitespace-nowrap">{accountName}</td>

                        {/* Amount */}
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-gray-900 whitespace-nowrap">
                          {formatAmount(t.amount)}
                        </td>

                        {/* Category — always-visible select */}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <select
                            value={t.category || ''}
                            onChange={e => handleCategoryChange(t.id, 'category', e.target.value)}
                            className={`text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white ${
                              t.category ? 'border-gray-200 text-gray-700' : 'border-amber-300 text-amber-600'
                            }`}
                          >
                            <option value="">— Uncategorised —</option>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>

                        {/* Classification — always-visible select */}
                        <td className="px-4 py-3 hidden lg:table-cell" onClick={e => e.stopPropagation()}>
                          <select
                            value={t.classification || ''}
                            onChange={e => handleCategoryChange(t.id, 'classification', e.target.value)}
                            className={`text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white ${
                              t.classification ? 'border-gray-200 text-gray-700' : 'border-gray-200 text-gray-400'
                            }`}
                          >
                            <option value="">—</option>
                            {CLASSIFICATIONS.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>

                        {/* Action menu */}
                        <td className="px-2 py-3 relative" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setMenuOpenId(menuOpenId === t.id ? null : t.id)}
                            className="p-1 rounded hover:bg-gray-100 transition-colors"
                          >
                            <EllipsisHorizontalIcon className="h-4 w-4 text-gray-400" />
                          </button>
                          {menuOpenId === t.id && (
                            <div className="absolute right-0 top-8 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-48">
                              {t.is_transfer ? (
                                <button onClick={() => handleUnexclude(t.id)}
                                  className="w-full text-left px-4 py-2 text-sm text-emerald-700 hover:bg-gray-50">
                                  Un-exclude (include in reports)
                                </button>
                              ) : (
                                <button onClick={() => handleExclude(t.id)}
                                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                                  Exclude from reports
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <tr className={rowBg(t)}>
                          <td />
                          <td colSpan={6} className="px-4 pb-4 pt-0">
                            <DetailPanel t={t} accountName={accountName} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              <ChevronLeftIcon className="h-4 w-4" /> Prev
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              Next <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
