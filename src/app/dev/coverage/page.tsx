'use client'

import { useState, useCallback } from 'react'
import type { CoverageRow, TxExpansionRow } from '@/lib/coverageReport'

// ─── Filter state ─────────────────────────────────────────────────────────────

interface Filters {
  unmatchedOnly: boolean
  source: string
  from: string
  to: string
}

function buildUrl(filters: Filters): string {
  const p = new URLSearchParams()
  if (filters.unmatchedOnly) p.set('unmatched', 'true')
  if (filters.source) p.set('source', filters.source)
  if (filters.from) p.set('from', filters.from)
  if (filters.to) p.set('to', filters.to)
  const qs = p.toString()
  return `/api/dev/coverage${qs ? `?${qs}` : ''}`
}

function buildExpandUrl(merchant: string, filters: Filters): string {
  const p = new URLSearchParams({ merchant })
  if (filters.source) p.set('source', filters.source)
  if (filters.from) p.set('from', filters.from)
  if (filters.to) p.set('to', filters.to)
  return `/api/dev/coverage?${p.toString()}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RuleBadge({ rule }: { rule: string | null }) {
  if (rule) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-blue-50 text-blue-700 border border-blue-200">
        {rule}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
      no match
    </span>
  )
}

function ExpansionRow({ tx }: { tx: TxExpansionRow }) {
  return (
    <tr className="bg-gray-50 border-t border-gray-100">
      <td className="pl-10 pr-4 py-1.5 tabular-nums text-gray-500 text-xs">{tx.date ?? '—'}</td>
      <td className="px-4 py-1.5 tabular-nums text-xs text-gray-700">
        <span className={tx.isIncome ? 'text-green-700' : 'text-red-700'}>
          {tx.isIncome ? '+' : ''}
          {tx.amount.toFixed(2)}
        </span>
      </td>
      <td className="px-4 py-1.5 text-xs text-gray-500">{tx.glAccount ?? '—'}</td>
      <td className="px-4 py-1.5 text-xs font-mono text-gray-500 max-w-xs truncate" colSpan={4}>
        {tx.rawDescription ?? '—'}
      </td>
    </tr>
  )
}

function MerchantRow({
  row,
  filters,
}: {
  row: CoverageRow
  filters: Filters
}) {
  const [expanded, setExpanded] = useState(false)
  const [txRows, setTxRows] = useState<TxExpansionRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  const handleExpand = useCallback(async () => {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (txRows !== null) return
    setLoading(true)
    try {
      const res = await fetch(buildExpandUrl(row.merchant, filters))
      const data = await res.json()
      setTxRows(data.transactions ?? [])
    } finally {
      setLoading(false)
    }
  }, [expanded, txRows, row.merchant, filters])

  return (
    <>
      <tr
        className="hover:bg-gray-50 cursor-pointer"
        onClick={handleExpand}
        aria-expanded={expanded}
      >
        <td className="px-4 py-2 font-medium text-gray-900 flex items-center gap-1">
          <span className="text-gray-400 text-xs select-none w-4">{expanded ? '▼' : '▶'}</span>
          {row.merchant}
        </td>
        <td className="px-4 py-2 tabular-nums text-gray-700">{row.count.toLocaleString()}</td>
        <td className="px-4 py-2 tabular-nums text-gray-700">
          {row.totalValue < 0 ? '-' : '+'}${Math.abs(row.totalValue).toFixed(2)}
        </td>
        <td className="px-4 py-2">
          <RuleBadge rule={row.matchedRule} />
        </td>
        <td className="px-4 py-2 text-gray-600 text-sm">{row.autoCategory ?? <span className="text-gray-400">—</span>}</td>
        <td className="px-4 py-2 text-gray-600 text-sm">{row.autoOwner ?? <span className="text-gray-400">—</span>}</td>
        <td className="px-4 py-2 text-gray-400 text-xs font-mono max-w-xs truncate">
          {row.exampleRawDescription ?? '—'}
        </td>
      </tr>
      {expanded && loading && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-10 py-2 text-xs text-gray-400 italic">Loading…</td>
        </tr>
      )}
      {expanded && !loading && txRows !== null && txRows.map((tx, i) => (
        <ExpansionRow key={i} tx={tx} />
      ))}
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CoveragePage() {
  const [filters, setFilters] = useState<Filters>({
    unmatchedOnly: true,
    source: '',
    from: '',
    to: '',
  })
  const [rows, setRows] = useState<CoverageRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runQuery = useCallback(async (f: Filters) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(buildUrl(f))
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      setRows(data.rows ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters(prev => ({ ...prev, [key]: value }))

  const matchedCount = rows ? rows.filter(r => r.matchedRule !== null).length : 0
  const unmatchedCount = rows ? rows.filter(r => r.matchedRule === null).length : 0

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Coverage Inspector</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review merchant rule coverage. Expand any row to see individual transactions.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-4 bg-gray-50 border border-gray-200 rounded p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.unmatchedOnly}
            onChange={e => setFilter('unmatchedOnly', e.target.checked)}
            className="rounded border-gray-300"
          />
          Unmatched only
        </label>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Source</label>
          <select
            value={filters.source}
            onChange={e => setFilter('source', e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white"
          >
            <option value="">All</option>
            <option value="xero">Xero</option>
            <option value="csv">CSV</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">From</label>
          <input
            type="date"
            value={filters.from}
            onChange={e => setFilter('from', e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1.5"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">To</label>
          <input
            type="date"
            value={filters.to}
            onChange={e => setFilter('to', e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1.5"
          />
        </div>

        <button
          onClick={() => runQuery(filters)}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Loading…' : rows !== null ? 'Refresh' : 'Load'}
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary badges */}
      {rows !== null && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-600">{rows.length} merchants</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            {matchedCount} matched
          </span>
          {unmatchedCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
              {unmatchedCount} unmatched
            </span>
          )}
        </div>
      )}

      {/* Table */}
      {rows !== null && (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Merchant', 'Count', 'Total value', 'Matched rule', 'Category', 'Owner', 'Example raw description'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-400 text-sm">
                    No merchants found.
                  </td>
                </tr>
              )}
              {rows.map(row => (
                <MerchantRow key={row.merchant} row={row} filters={filters} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows === null && !loading && !error && (
        <p className="text-sm text-gray-400">Set filters and click &ldquo;Load&rdquo; to inspect coverage.</p>
      )}
    </div>
  )
}
