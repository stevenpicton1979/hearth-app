'use client'

import { useState, useCallback } from 'react'

interface AccountReconciliation {
  id: string
  name: string
  xeroCount: number | null
  lastSyncedAt: string | null
  dbCount: number
  minDate: string | null
  maxDate: string | null
  gapMonths: string[]
}

interface NearDuplicateGroup {
  merchant: string
  amount: number
  date: string
  count: number
}

interface ReconcileResult {
  accounts: AccountReconciliation[]
  externalIdDuplicates: string[]
  csvNearDuplicates: NearDuplicateGroup[]
}

function StatusBadge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
      {children}
    </span>
  )
}

export default function ReconcilePage() {
  const [data, setData] = useState<ReconcileResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runReconcile = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/reconcile')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const isClean = data
    ? data.externalIdDuplicates.length === 0 &&
      data.csvNearDuplicates.length === 0 &&
      data.accounts.every(a =>
        a.gapMonths.length === 0 &&
        (a.xeroCount === null || Math.abs(a.xeroCount - a.dbCount) <= 2)
      )
    : null

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Reconciliation</h1>
          <p className="mt-1 text-sm text-gray-500">
            Checks for gaps, duplicates, and coverage issues in synced transaction data.
          </p>
        </div>
        <button
          onClick={runReconcile}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Running…' : data ? 'Re-run' : 'Run check'}
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && (
        <>
          {isClean && (
            <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 font-medium">
              ✓ All checks passed — no issues found.
            </div>
          )}

          {/* Account table */}
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-3">Xero Accounts</h2>
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="min-w-full text-sm divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Account', 'Xero count', 'DB count', 'Match', 'Synced', 'Date range', 'Gap months', 'Status'].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {data.accounts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-4 text-center text-gray-400 text-sm">
                        No Xero accounts found.
                      </td>
                    </tr>
                  )}
                  {data.accounts.map(acct => {
                    const hasGaps = acct.gapMonths.length > 0
                    const countMismatch = acct.xeroCount !== null && Math.abs(acct.xeroCount - acct.dbCount) > 2
                    const rowBg = hasGaps || countMismatch ? 'bg-red-50' : ''
                    return (
                      <tr key={acct.id} className={rowBg}>
                        <td className="px-4 py-2 font-medium text-gray-900">{acct.name}</td>
                        <td className="px-4 py-2 tabular-nums text-gray-700">
                          {acct.xeroCount !== null ? acct.xeroCount.toLocaleString() : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-2 tabular-nums">{acct.dbCount.toLocaleString()}</td>
                        <td className="px-4 py-2">
                          {acct.xeroCount === null ? (
                            <span className="text-gray-400">—</span>
                          ) : countMismatch ? (
                            <span className="text-red-700 font-semibold">✗ {acct.xeroCount - acct.dbCount > 0 ? '+' : ''}{acct.xeroCount - acct.dbCount}</span>
                          ) : (
                            <span className="text-green-700 font-medium">✓</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-gray-500 tabular-nums text-xs">
                          {acct.lastSyncedAt
                            ? acct.lastSyncedAt.slice(0, 10)
                            : <span className="text-gray-400">never</span>}
                        </td>
                        <td className="px-4 py-2 text-gray-600 tabular-nums">
                          {acct.minDate && acct.maxDate
                            ? `${acct.minDate} → ${acct.maxDate}`
                            : '—'}
                        </td>
                        <td className="px-4 py-2">
                          {hasGaps ? (
                            <span className="text-red-700 font-medium">{acct.gapMonths.join(', ')}</span>
                          ) : (
                            <span className="text-gray-400">none</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge ok={!hasGaps && !countMismatch}>
                            {hasGaps
                              ? `${acct.gapMonths.length} gap${acct.gapMonths.length > 1 ? 's' : ''}`
                              : countMismatch
                                ? 'count mismatch'
                                : '✓ clean'}
                          </StatusBadge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* External-id duplicates */}
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-3">
              External-ID Duplicates
              <StatusBadge ok={data.externalIdDuplicates.length === 0}>
                {data.externalIdDuplicates.length === 0 ? '✓ none' : `${data.externalIdDuplicates.length} found`}
              </StatusBadge>
            </h2>
            {data.externalIdDuplicates.length > 0 ? (
              <ul className="text-sm space-y-1 text-red-700">
                {data.externalIdDuplicates.map(id => (
                  <li key={id} className="font-mono">{id}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">No duplicate external IDs found.</p>
            )}
          </section>

          {/* CSV near-duplicates */}
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-3">
              CSV Near-Duplicates{' '}
              <StatusBadge ok={data.csvNearDuplicates.length === 0}>
                {data.csvNearDuplicates.length === 0 ? '✓ none' : `${data.csvNearDuplicates.length} groups`}
              </StatusBadge>
            </h2>
            {data.csvNearDuplicates.length > 0 ? (
              <div className="overflow-x-auto rounded border border-gray-200">
                <table className="min-w-full text-sm divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Merchant', 'Amount', 'Date', 'Count'].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {data.csvNearDuplicates.map((row, i) => (
                      <tr key={i} className="bg-yellow-50">
                        <td className="px-4 py-2 font-medium">{row.merchant}</td>
                        <td className="px-4 py-2 tabular-nums">${Math.abs(row.amount).toFixed(2)}</td>
                        <td className="px-4 py-2 tabular-nums">{row.date}</td>
                        <td className="px-4 py-2 text-red-700 font-medium">{row.count}×</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
           