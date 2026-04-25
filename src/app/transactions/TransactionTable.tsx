'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { CATEGORIES, CLASSIFICATIONS } from '@/lib/constants'
import { Transaction } from '@/lib/types'
import {
  MagnifyingGlassIcon,
  EllipsisHorizontalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'

interface Props {
  initialTransactions: Transaction[]
  accounts: { id: string; display_name: string }[]
  initialCategory?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Math.abs(n))
}

function formatDate(s: string): string {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function cardBorder(t: Transaction): string {
  if (t.is_transfer) return 'border-gray-200 bg-gray-50'
  if (!t.category)    return 'border-amber-200 bg-amber-50'
  if (!t.classification) return 'border-green-200 bg-green-50'
  return 'border-gray-200 bg-white'
}

// ─── Detail panel (mirrors ExampleCard on the training page) ──────────────────

function DetailPanel({ t, accountName }: { t: Transaction; accountName: string }) {
  const isCredit   = t.amount > 0
  const fromLabel  = isCredit ? t.merchant : accountName
  const toLabel    = isCredit ? accountName : t.merchant
  const sourceLabel = t.accounts?.institution === 'Xero' ? 'Xero' : 'CSV'

  return (
    <div className="text-xs bg-gray-50 border border-gray-100 rounded p-3 mt-2">
      <div className="grid gap-x-4 gap-y-1.5" style={{ gridTemplateColumns: '5rem 1fr' }}>
        <span className="text-gray-400 uppercase tracking-wide text-[10px] pt-px">From</span>
        <span className="text-gray-700">{fromLabel}</span>

        <span className="text-gray-400 uppercase tracking-wide text-[10px] pt-px">To</span>
        <span className="text-gray-700 font-medium">{toLabel}</span>

        <span className="text-gray-400 uppercase tracking-wide text-[10px] pt-px">When</span>
        <span className="text-gray-700">{formatDate(t.date)}</span>

        <span className="text-gray-400 uppercase tracking-wide text-[10px] pt-px">Amount</span>
        <span className="flex items-center gap-1.5 text-gray-700">
          {formatAmount(t.amount)}
          <span className={`font-medium rounded px-1 py-px ${isCredit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {isCredit ? 'CREDIT' : 'DEBIT'}
          </span>
          {t.is_transfer && (
            <span className="font-medium rounded px-1 py-px bg-gray-200 text-gray-500">TRANSFER</span>
          )}
        </span>

        <span className="text-gray-400 uppercase tracking-wide text-[10px] pt-px">Source</span>
        <span className="text-gray-700">{sourceLabel}</span>

        {(t.category || t.classification) && (
          <>
            <span className="text-gray-400 uppercase tracking-wide text-[10px] pt-px">Category</span>
            <span className="text-gray-700">
              {t.category ?? <span className="italic text-amber-500">Uncategorised</span>}
              {t.classification && <span className="ml-1.5 text-gray-400">· {t.classification}</span>}
            </span>
          </>
        )}

        {t.raw_description && (
          <>
            <span className="text-gray-400 uppercase tracking-wide text-[10px] self-start pt-px">Raw</span>
            <span className="text-gray-600 font-mono whitespace-pre-wrap break-all">{t.raw_description}</span>
          </>
        )}

        {t.notes && (
          <>
            <span className="text-gray-400 uppercase tracking-wide text-[10px] self-start pt-px">Notes</span>
            <span className="text-gray-600">{t.notes}</span>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Transaction Card ─────────────────────────────────────────────────────────

function TransactionCard({
  t,
  accountName,
  onCategoryChange,
  onExclude,
  onUnexclude,
}: {
  t: Transaction
  accountName: string
  onCategoryChange: (id: string, field: 'category' | 'classification', value: string) => Promise<void>
  onExclude: (id: string) => Promise<void>
  onUnexclude: (id: string) => Promise<void>
}) {
  const [showDetails, setShowDetails] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const isCredit = t.amount > 0

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className={`border rounded-xl p-4 ${cardBorder(t)}`}>
      <div className="flex gap-4 items-start">

        {/* Left — date, merchant, account, amount */}
        <div className="w-52 flex-shrink-0">
          <div className="text-xs text-gray-400 mb-0.5">{formatDate(t.date)}</div>
          <div className="font-semibold text-sm text-gray-900 break-words leading-snug">{t.merchant}</div>

          {t.raw_description && t.raw_description !== t.merchant && (
            <div className="text-xs text-gray-400 font-mono mt-0.5 break-all leading-snug">{t.raw_description}</div>
          )}

          <div className="text-xs text-gray-400 mt-1">{accountName}</div>

          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="font-semibold text-sm text-gray-900">{formatAmount(t.amount)}</span>
            {t.is_transfer
              ? <span className="text-xs font-medium rounded px-1.5 py-0.5 bg-gray-200 text-gray-500">TRANSFER</span>
              : isCredit
                ? <span className="text-xs font-medium rounded px-1.5 py-0.5 bg-green-100 text-green-700">CREDIT</span>
                : <span className="text-xs font-medium rounded px-1.5 py-0.5 bg-red-100 text-red-700">DEBIT</span>
            }
          </div>
        </div>

        {/* Right — always-visible dropdowns + action menu */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex gap-2 flex-wrap items-center">
            <select
              value={t.category || ''}
              onChange={e => onCategoryChange(t.id, 'category', e.target.value)}
              className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
            >
              <option value="">— No category —</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select
              value={t.classification || ''}
              onChange={e => onCategoryChange(t.id, 'classification', e.target.value)}
              className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
            >
              <option value="">—</option>
              {CLASSIFICATIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {!t.category && !t.is_transfer && (
            <div className="text-xs text-amber-600 italic">Needs category</div>
          )}
          {t.category && !t.classification && !t.is_transfer && (
            <div className="text-xs text-emerald-600 italic">Needs classification</div>
          )}
        </div>

        {/* Action menu */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
          >
            <EllipsisHorizontalIcon className="h-4 w-4 text-gray-400" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-48">
              {t.is_transfer ? (
                <button
                  onClick={async () => { setMenuOpen(false); await onUnexclude(t.id) }}
                  className="w-full text-left px-4 py-2 text-sm text-emerald-700 hover:bg-gray-50"
                >
                  Un-exclude (include in reports)
                </button>
              ) : (
                <button
                  onClick={async () => { setMenuOpen(false); await onExclude(t.id) }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Exclude from reports
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail toggle */}
      <div className="mt-2 pt-2 border-t border-gray-100">
        <button
          onClick={() => setShowDetails(s => !s)}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          {showDetails ? '▼ Hide details' : '▶ Show details'}
        </button>
        {showDetails && <DetailPanel t={t} accountName={accountName} />}
      </div>
    </div>
  )
}

// ─── Main Table Component ─────────────────────────────────────────────────────

export function TransactionTable({ initialTransactions, accounts, initialCategory }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions)
  const [count, setCount] = useState<number>(initialTransactions.length)
  const [page, setPage] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  // Filters
  const [filterAccount, setFilterAccount]             = useState('')
  const [filterCategory, setFilterCategory]           = useState(initialCategory || '')
  const [filterClassification, setFilterClassification] = useState('')
  const [filterFrom, setFilterFrom]                   = useState('')
  const [filterTo, setFilterTo]                       = useState('')
  const [filterSearch, setFilterSearch]               = useState('')
  const [debouncedSearch, setDebouncedSearch]         = useState('')
  const [showTransfers, setShowTransfers]             = useState(false)
  const [filterAmountMin, setFilterAmountMin]         = useState('')
  const [filterAmountMax, setFilterAmountMax]         = useState('')

  // Sort
  const [sortBy, setSortBy]   = useState<'date' | 'amount' | 'merchant' | 'category'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Debounce search
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
    const body: Record<string, string | null> = { [field]: value || null }
    await fetch(`/api/transactions/${id}/categorise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    fetchTransactions(page)
  }

  const handleExclude = async (id: string) => {
    await fetch('/api/transactions/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], action: 'exclude' }),
    })
    fetchTransactions(page)
  }

  const handleUnexclude = async (id: string) => {
    await fetch('/api/transactions/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id], action: 'unexclude' }),
    })
    fetchTransactions(page)
  }

  const totalPages = Math.ceil(count / 50)

  return (
    <div className="space-y-4">

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {/* Search */}
          <div className="relative col-span-2 md:col-span-2">
            <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search merchant..."
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
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

          {/* Sort */}
          <div className="flex gap-1">
            <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="date">Date</option>
              <option value="amount">Amount</option>
              <option value="merchant">Merchant</option>
              <option value="category">Category</option>
            </select>
            <button onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
              className="px-2 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              {sortDir === 'desc' ? '↓' : '↑'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input type="number" placeholder="Min amount" value={filterAmountMin}
            onChange={e => setFilterAmountMin(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <input type="number" placeholder="Max amount" value={filterAmountMax}
            onChange={e => setFilterAmountMax(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />

          <label className="col-span-2 flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={showTransfers} onChange={e => setShowTransfers(e.target.checked)}
              className="rounded text-emerald-600" />
            Show excluded / transfers
          </label>
        </div>

        <div className="flex justify-end">
          <span className="text-sm text-gray-400">{count} transactions</span>
        </div>
      </div>

      {/* ── Cards ──────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading...</div>
      ) : transactions.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">No transactions found.</div>
      ) : (
        <div className="space-y-2">
          {transactions.map(t => (
            <TransactionCard
              key={t.id}
              t={t}
              accountName={accounts.find(a => a.id === t.account_id)?.display_name || '—'}
              onCategoryChange={handleCategoryChange}
              onExclude={handleExclude}
              onUnexclude={handleUnexclude}
            />
          ))}
        </div>
      )}

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
