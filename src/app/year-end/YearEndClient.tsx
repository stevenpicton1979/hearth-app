'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  YearEndClassification,
  CLASSIFICATION_LABELS,
  YEAR_END_CLASSIFICATIONS,
  classificationFromMatchedRule,
  payloadFor,
  REVERT_PAYLOAD,
  summarizeRows,
  fyLabel,
} from '@/lib/yearEnd'

export interface ClientRow {
  id: string
  date: string
  amount: number
  contact_name: string | null
  linked_gl_account: string | null
  is_provisional: boolean
  matched_rule: string | null
  classification: YearEndClassification | null
}

interface Props {
  fy: number
  initialRows: ClientRow[]
}

const aud = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)

const fmtDate = (s: string) =>
  new Date(s + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })

const PILL_BY_CLASS: Record<YearEndClassification, string> = {
  'director-income-steven': 'bg-emerald-100 text-emerald-800',
  'director-income-nicola': 'bg-emerald-100 text-emerald-800',
  'wage-steven': 'bg-blue-100 text-blue-800',
  'directors-loan': 'bg-purple-100 text-purple-800',
  'reimbursement': 'bg-purple-100 text-purple-800',
}

export function YearEndClient({ fy, initialRows }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<ClientRow[]>(initialRows)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [bulkChoice, setBulkChoice] = useState<YearEndClassification | ''>('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  const summary = useMemo(() => summarizeRows(rows), [rows])
  const provisionalRows = useMemo(() => rows.filter(r => r.is_provisional), [rows])

  function applyLocalUpdate(ids: string[], classification: YearEndClassification | 'revert') {
    setRows(prev => prev.map(r => {
      if (!ids.includes(r.id)) return r
      if (classification === 'revert') {
        return {
          ...r,
          is_provisional: REVERT_PAYLOAD.is_provisional,
          matched_rule: REVERT_PAYLOAD.matched_rule,
          classification: null,
        }
      }
      const p = payloadFor(classification)
      return {
        ...r,
        is_provisional: p.is_provisional,
        matched_rule: p.matched_rule,
        classification,
      }
    }))
  }

  async function classify(ids: string[], classification: YearEndClassification | 'revert') {
    const res = await fetch('/api/year-end/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, classification }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'unknown error' }))
      throw new Error(body.error ?? 'classify failed')
    }
  }

  async function handleRowClassify(id: string, classification: YearEndClassification | 'revert') {
    setBusyIds(prev => new Set(prev).add(id))
    setRowError(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    try {
      await classify([id], classification)
      applyLocalUpdate([id], classification)
    } catch (e) {
      setRowError(prev => ({ ...prev, [id]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setBusyIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  async function handleBulkApply() {
    if (!bulkChoice || selected.size === 0) return
    setBulkBusy(true)
    setBulkError(null)
    const ids = Array.from(selected)
    try {
      await classify(ids, bulkChoice)
      applyLocalUpdate(ids, bulkChoice)
      setSelected(new Set())
      setBulkChoice('')
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : String(e))
    } finally {
      setBulkBusy(false)
    }
  }

  function toggleSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAllProvisional() {
    const provIds = provisionalRows.map(r => r.id)
    const allSelected = provIds.length > 0 && provIds.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) provIds.forEach(id => next.delete(id))
      else provIds.forEach(id => next.add(id))
      return next
    })
  }

  function navigateFY(delta: number) {
    router.push(`/year-end?fy=${fy + delta}`)
  }

  const allProvSelected = provisionalRows.length > 0 && provisionalRows.every(r => selected.has(r.id))

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Year-End Director Drawings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Classify provisional draws from BHT into Director Income, Wages, Loans, or Reimbursements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigateFY(-1)}
            className="px-2 py-1 text-sm border border-gray-200 rounded hover:bg-gray-50"
            aria-label="Previous financial year"
          >
            ←
          </button>
          <span className="text-sm font-medium text-gray-900 min-w-[10rem] text-center">
            {fyLabel(fy)}
          </span>
          <button
            type="button"
            onClick={() => navigateFY(1)}
            className="px-2 py-1 text-sm border border-gray-200 rounded hover:bg-gray-50"
            aria-label="Next financial year"
          >
            →
          </button>
        </div>
      </div>

      {/* Summary card */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex gap-8 text-sm flex-wrap">
          <div>
            <span className="text-xs text-gray-400 block">Total drawn</span>
            <span className="font-semibold text-gray-900 text-xl">{aud(summary.totalDrawn)}</span>
          </div>
          <div>
            <span className="text-xs text-gray-400 block">Provisional</span>
            <span className="font-semibold text-amber-600 text-xl">{aud(summary.provisionalTotal)}</span>
          </div>
          <div>
            <span className="text-xs text-gray-400 block">Confirmed</span>
            <span className="font-semibold text-emerald-600 text-xl">{aud(summary.confirmedTotal)}</span>
          </div>
        </div>

        {/* Classification breakdown */}
        <div className="mt-4 pt-4 border-t border-gray-100 flex gap-4 flex-wrap text-xs text-gray-600">
          {YEAR_END_CLASSIFICATIONS.map(c => {
            const bucket = summary.byClassification[c]
            return (
              <div key={c} className="flex items-center gap-1.5">
                <span className={`inline-block px-1.5 py-0.5 rounded ${PILL_BY_CLASS[c]}`}>
                  {CLASSIFICATION_LABELS[c]}
                </span>
                <span className="text-gray-500">{bucket.count} · {aud(bucket.total)}</span>
              </div>
            )
          })}
          <div className="flex items-center gap-1.5">
            <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Provisional</span>
            <span className="text-gray-500">{summary.provisionalCount} · {aud(summary.provisionalTotal)}</span>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-700">No Director Drawings in {fyLabel(fy)}.</p>
          <p className="text-xs text-gray-500 mt-2">
            If you expected draws here, check the dashboard&apos;s Director Drawings widget — that confirms the foundation rules are firing.
          </p>
        </div>
      ) : (
        <>
          {/* Bulk actions bar */}
          {selected.size > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 flex items-center gap-3 flex-wrap">
              <span className="text-sm text-amber-800 font-medium">
                Classify selected ({selected.size}) as
              </span>
              <select
                value={bulkChoice}
                onChange={e => setBulkChoice(e.target.value as YearEndClassification | '')}
                className="text-sm border border-amber-300 rounded px-2 py-1 bg-white"
              >
                <option value="">Choose…</option>
                {YEAR_END_CLASSIFICATIONS.map(c => (
                  <option key={c} value={c}>{CLASSIFICATION_LABELS[c]}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleBulkApply}
                disabled={!bulkChoice || bulkBusy}
                className="text-sm px-3 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkBusy ? 'Applying…' : 'Apply'}
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Clear selection
              </button>
              {bulkError && <span className="text-sm text-red-600">{bulkError}</span>}
            </div>
          )}

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left w-8">
                    <input
                      type="checkbox"
                      checked={allProvSelected}
                      onChange={toggleSelectAllProvisional}
                      aria-label="Select all provisional rows"
                      disabled={provisionalRows.length === 0}
                    />
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Date</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Contact</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">GL account</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">Amount</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.id} className={r.is_provisional ? 'bg-amber-50/30' : ''}>
                    <td className="px-3 py-2">
                      {r.is_provisional && (
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleSelected(r.id)}
                          aria-label={`Select row ${r.id}`}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2 text-gray-700">{r.contact_name ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{r.linked_gl_account ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900 whitespace-nowrap">{aud(r.amount)}</td>
                    <td className="px-3 py-2">
                      {r.is_provisional ? (
                        <div className="flex items-center gap-2">
                          <select
                            value=""
                            onChange={e => {
                              const v = e.target.value as YearEndClassification | ''
                              if (v) handleRowClassify(r.id, v)
                              e.target.value = ''
                            }}
                            disabled={busyIds.has(r.id)}
                            className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
                          >
                            <option value="">Classify…</option>
                            {YEAR_END_CLASSIFICATIONS.map(c => (
                              <option key={c} value={c}>{CLASSIFICATION_LABELS[c]}</option>
                            ))}
                          </select>
                          {busyIds.has(r.id) && (
                            <span className="text-xs text-gray-500">Saving…</span>
                          )}
                          {rowError[r.id] && (
                            <span className="text-xs text-red-600">{rowError[r.id]}</span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {r.classification ? (
                            <span className={`text-xs px-2 py-0.5 rounded ${PILL_BY_CLASS[r.classification]}`}>
                              {CLASSIFICATION_LABELS[r.classification]}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Confirmed</span>
                          )}
                          {classificationFromMatchedRule(r.matched_rule) && (
                            <button
                              type="button"
                              onClick={() => handleRowClassify(r.id, 'revert')}
                              disabled={busyIds.has(r.id)}
                              className="text-xs text-gray-500 hover:text-gray-900 hover:underline disabled:opacity-50"
                            >
                              {busyIds.has(r.id) ? 'Reverting…' : 'Revert'}
                            </button>
                          )}
                          {rowError[r.id] && (
                            <span className="text-xs text-red-600">{rowError[r.id]}</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
