'use client'

import { useState, useEffect, useRef } from 'react'
import { DetectedSubscription, Subscription } from '@/lib/types'
import { CalendarIcon, CheckCircleIcon, ChevronDownIcon, ChevronRightIcon, XMarkIcon, PlusIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline'

// ── Public exports (used by page.tsx) ────────────────────────────────────────

export interface DuplicateSubscription {
  merchant: string
  accounts: { account_id: string; account_name: string; amount: number; last_charged: string }[]
  monthly_waste: number
}

export interface TimelineItem {
  merchant: string
  account_id: string
  amount: number
  expected_date: string
  frequency: string
  is_overdue: boolean
}

interface Props {
  activeSubscriptions: Subscription[]
  cancelledSubscriptions: Subscription[]
  candidateList: DetectedSubscription[]
  detectedBySubId: Record<string, DetectedSubscription>
  dismissedMerchants: string[]
  duplicates: DuplicateSubscription[]
  timeline: TimelineItem[]
  accounts: { id: string; display_name: string }[]
}

// ── Drill-down transaction type ───────────────────────────────────────────────

interface DrillDownTx {
  date: string
  amount: number
  raw_description: string | null
  description: string
  merchant: string
  account_id: string
  account_name: string | null
  category: string | null
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(n)
}
function fmtRounded(n: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}
function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}
function frequencyLabel(f: string): string {
  return ({ weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual' } as Record<string, string>)[f] ?? f
}
function confidenceBadgeCls(c: DetectedSubscription['confidence']) {
  if (c === 'HIGH') return 'bg-emerald-100 text-emerald-800'
  if (c === 'MEDIUM') return 'bg-amber-100 text-amber-800'
  return 'bg-gray-100 text-gray-600'
}

// ── Transactions drill-down ───────────────────────────────────────────────────

function TransactionsDrillDown({
  subscriptionId,
  merchant,
}: {
  subscriptionId?: string | null
  merchant?: string
}) {
  const [txns, setTxns] = useState<DrillDownTx[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const url = subscriptionId
      ? `/api/subscriptions/transactions?subscription_id=${encodeURIComponent(subscriptionId)}`
      : merchant
        ? `/api/subscriptions/transactions?merchant=${encodeURIComponent(merchant)}`
        : null
    if (!url) { setLoading(false); return }
    fetch(url)
      .then(r => r.json())
      .then(d => { setTxns(d.transactions ?? []); setLoading(false) })
      .catch(() => { setError('Failed to load transactions'); setLoading(false) })
  }, [subscriptionId, merchant])

  if (loading) return <p className="text-xs text-gray-400 py-2">Loading transactions…</p>
  if (error) return <p className="text-xs text-red-500 py-2">{error}</p>
  if (!txns || txns.length === 0) return <p className="text-xs text-gray-400 py-2">No transactions found.</p>

  return (
    <div className="overflow-x-auto rounded border border-gray-100 mt-1">
      <table className="min-w-full text-xs divide-y divide-gray-100">
        <thead className="bg-gray-50">
          <tr>
            {['Date', 'Amount', 'Raw description', 'Merchant', 'Account', 'Category'].map(h => (
              <th key={h} className="px-3 py-1.5 text-left font-medium text-gray-500 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-50">
          {txns.map((tx, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-3 py-1.5 tabular-nums text-gray-700 whitespace-nowrap">{tx.date}</td>
              <td className="px-3 py-1.5 tabular-nums text-gray-900 whitespace-nowrap">{fmt(tx.amount)}</td>
              <td className="px-3 py-1.5 text-gray-500 max-w-xs truncate">{tx.raw_description ?? tx.description}</td>
              <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{tx.merchant}</td>
              <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{tx.account_name ?? '—'}</td>
              <td className="px-3 py-1.5 text-gray-500">{tx.category ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Metadata form ─────────────────────────────────────────────────────────────

interface MetaFormState {
  name: string
  cancellation_url: string
  account_email: string
  notes: string
  auto_renews: boolean
  next_renewal_override: string
  category: string
}

function MetadataForm({
  sub,
  onSaved,
}: {
  sub: Subscription
  onSaved: (row: Record<string, unknown>) => void
}) {
  const [form, setForm] = useState<MetaFormState>({
    name: sub.name,
    cancellation_url: sub.cancellation_url ?? '',
    account_email: sub.account_email ?? '',
    notes: sub.notes ?? '',
    auto_renews: sub.auto_renews,
    next_renewal_override: sub.next_renewal_override ?? '',
    category: sub.category ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim() || sub.name,
          cancellation_url: form.cancellation_url || null,
          account_email: form.account_email || null,
          notes: form.notes || null,
          auto_renews: form.auto_renews,
          next_renewal_override: form.next_renewal_override || null,
          category: form.category || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        setSaveError(err.error ?? 'Save failed')
      } else {
        const updated = await res.json()
        setSavedAt(new Date().toLocaleTimeString('en-AU'))
        onSaved(updated)
      }
    } catch {
      setSaveError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Details</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-0.5">Name</label>
          <input
            type="text"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-0.5">Cancellation URL</label>
          <div className="flex items-center gap-1">
            <input
              type="url"
              className="flex-1 text-sm border border-gray-200 rounded px-2 py-1"
              value={form.cancellation_url}
              onChange={e => setForm(f => ({ ...f, cancellation_url: e.target.value }))}
              placeholder="https://…"
            />
            {form.cancellation_url && (
              <a href={form.cancellation_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                Open ↗
              </a>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-0.5">Account email</label>
          <input
            type="email"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1"
            value={form.account_email}
            onChange={e => setForm(f => ({ ...f, account_email: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-0.5">Category</label>
          <input
            type="text"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1"
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-0.5">Next renewal override</label>
          <input
            type="date"
            className="w-full text-sm border border-gray-200 rounded px-2 py-1"
            value={form.next_renewal_override}
            onChange={e => setForm(f => ({ ...f, next_renewal_override: e.target.value }))}
          />
        </div>
        <div className="flex items-center gap-2 pt-4">
          <input
            type="checkbox"
            id={`ar-${sub.id}`}
            checked={form.auto_renews}
            onChange={e => setForm(f => ({ ...f, auto_renews: e.target.checked }))}
            className="rounded"
          />
          <label htmlFor={`ar-${sub.id}`} className="text-sm text-gray-700">Auto-renews</label>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-0.5">Notes</label>
        <textarea
          className="w-full text-sm border border-gray-200 rounded px-2 py-1 resize-none"
          rows={2}
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs bg-gray-900 text-white rounded px-3 py-1.5 hover:bg-gray-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {savedAt && <span className="text-xs text-green-700">Saved at {savedAt}</span>}
        {saveError && <span className="text-xs text-red-600">{saveError}</span>}
      </div>
    </div>
  )
}

// ── Merchant alias manager ────────────────────────────────────────────────────

function MerchantAliasManager({
  sub,
  onMerchantsChanged,
}: {
  sub: Subscription
  onMerchantsChanged: (merchants: string[]) => void
}) {
  const [merchants, setMerchants] = useState(sub.merchants)
  const [addInput, setAddInput] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [removeWarning, setRemoveWarning] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [available, setAvailable] = useState<string[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = `merchants-list-${sub.id}`

  async function loadAvailable() {
    if (available !== null) return
    try {
      const res = await fetch('/api/subscriptions/available-merchants')
      const data = await res.json()
      setAvailable(data.merchants ?? [])
    } catch {
      setAvailable([])
    }
  }

  async function handleAdd() {
    const m = addInput.trim()
    if (!m) return
    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}/merchants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant: m }),
      })
      if (res.ok || res.status === 201) {
        const updated = [...merchants, m]
        setMerchants(updated)
        onMerchantsChanged(updated)
        setAddInput('')
        setAvailable(prev => prev ? prev.filter(x => x !== m) : null)
      } else {
        const d = await res.json()
        setAddError(d.error ?? 'Failed to add')
      }
    } catch {
      setAddError('Network error')
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(merchant: string) {
    setRemoveWarning(null)
    if (merchants.length === 1) {
      setRemoveWarning('Cannot remove the last alias — dismiss the subscription instead.')
      return
    }
    const res = await fetch(
      `/api/subscriptions/${sub.id}/merchants/${encodeURIComponent(merchant)}`,
      { method: 'DELETE' }
    )
    if (res.ok) {
      const updated = merchants.filter(m => m !== merchant)
      setMerchants(updated)
      onMerchantsChanged(updated)
      setAvailable(prev => prev ? [...prev, merchant].sort() : null)
    }
  }

  const filteredAvailable = (available ?? []).filter(m => !merchants.includes(m))

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Merchant Aliases</h4>
      <div className="flex flex-wrap gap-1 mb-2">
        {merchants.length === 0 && (
          <span className="text-xs text-gray-400">No merchants linked — add one below to enable detection.</span>
        )}
        {merchants.map(m => (
          <span key={m} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs rounded px-2 py-0.5">
            {m}
            <button
              onClick={() => handleRemove(m)}
              className="text-gray-400 hover:text-red-500 leading-none"
              title={merchants.length === 1 ? 'Cannot remove last alias' : 'Remove alias'}
            >
              <XMarkIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      {removeWarning && <p className="text-xs text-amber-600 mb-2">{removeWarning}</p>}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          id="add-merchant-input"
          list={listId}
          type="text"
          className="text-sm border border-gray-200 rounded px-2 py-1 flex-1"
          placeholder="Add merchant alias…"
          value={addInput}
          onChange={e => setAddInput(e.target.value)}
          onFocus={loadAvailable}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <datalist id={listId}>
          {filteredAvailable.map(m => <option key={m} value={m} />)}
        </datalist>
        <button
          onClick={handleAdd}
          disabled={adding || !addInput.trim()}
          className="text-xs bg-gray-900 text-white rounded px-2 py-1.5 hover:bg-gray-700 disabled:opacity-50 flex items-center"
          title="Add alias"
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {addError && <p className="text-xs text-red-600 mt-1">{addError}</p>}
    </div>
  )
}

// ── Merge modal ───────────────────────────────────────────────────────────────

function MergeModal({
  sub,
  otherSubs,
  onClose,
  onMerged,
}: {
  sub: Subscription
  otherSubs: Subscription[]
  onClose: () => void
  onMerged: (targetName: string) => void
}) {
  const [targetId, setTargetId] = useState('')
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleMerge() {
    if (!targetId) return
    setMerging(true)
    setError(null)
    try {
      const res = await fetch('/api/subscriptions/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: sub.id, target_id: targetId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Merge failed')
        return
      }
      const target = otherSubs.find(s => s.id === targetId)
      onMerged(target?.name ?? 'another subscription')
    } catch {
      setError('Network error')
    } finally {
      setMerging(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-semibold text-gray-900 mb-1">Merge into another subscription</h3>
        <p className="text-sm text-gray-500 mb-4">
          All merchant aliases from <strong>{sub.name}</strong> will move to the target subscription.
          This subscription will be deleted.
        </p>
        <select
          className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 mb-4"
          value={targetId}
          onChange={e => setTargetId(e.target.value)}
        >
          <option value="">Select subscription…</option>
          {otherSubs.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="text-sm text-gray-600 px-3 py-1.5 border border-gray-200 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleMerge}
            disabled={!targetId || merging}
            className="text-sm bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 disabled:opacity-50"
          >
            {merging ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cancel panel ──────────────────────────────────────────────────────────────

function CancelPanel({
  subId,
  defaultDate,
  onCancelled,
  onClose,
}: {
  subId: string
  defaultDate?: string
  onCancelled: (updated: Subscription) => void
  onClose: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [cancelDate, setCancelDate] = useState(defaultDate ?? today)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/subscriptions/${subId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelled_at: cancelDate }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Cancel failed')
        return
      }
      onCancelled(data.subscription)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs text-gray-500">Cancelled on:</label>
        <input
          type="date"
          className="text-sm border border-gray-200 rounded px-2 py-1"
          value={cancelDate}
          max={today}
          onChange={e => setCancelDate(e.target.value)}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs bg-red-600 text-white rounded px-3 py-1.5 hover:bg-red-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Mark as cancelled'}
        </button>
        <button
          onClick={onClose}
          className="text-xs text-gray-500 border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-50"
        >
          Close
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

// ── Row: active subscription ──────────────────────────────────────────────────

function SubscriptionRow({
  sub,
  detected,
  expanded,
  onToggle,
  onCancelled,
  onSubUpdated,
  onMerged,
  otherSubs,
  accounts,
}: {
  sub: Subscription
  detected: DetectedSubscription | null
  expanded: boolean
  onToggle: () => void
  onCancelled: (updated: Subscription) => void
  onSubUpdated: (updated: Subscription) => void
  onMerged: (targetName: string) => void
  otherSubs: Subscription[]
  accounts: { id: string; display_name: string }[]
}) {
  const [mergeOpen, setMergeOpen] = useState(false)
  const [showCancelPanel, setShowCancelPanel] = useState(false)

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-4 flex items-start gap-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center mt-0.5">
            <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 text-sm">{sub.name}</span>
                  {sub.possibly_cancelled && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                      Possibly cancelled
                    </span>
                  )}
                </div>
                {sub.merchants.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {sub.merchants.map(m => (
                      <span key={m} className="text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">{m}</span>
                    ))}
                  </div>
                )}
                <div className="text-xs text-gray-500 mt-1">
                  {detected
                    ? `${accounts.find(a => a.id === detected.account_id)?.display_name ?? 'Unknown'} · ${frequencyLabel(detected.frequency)}`
                    : <span className="text-amber-600">No recent transactions</span>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                {detected ? (
                  <>
                    <div className="font-bold text-gray-900 text-sm">{fmt(detected.amount)}</div>
                    <div className="text-xs text-gray-400">{fmtRounded(detected.annual_estimate)}/yr</div>
                  </>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </div>
            </div>
            {detected && (
              <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-gray-500">
                <span><span className="text-gray-400">Last:</span> {fmtDate(detected.last_charged)}</span>
                <span><span className="text-gray-400">Next:</span> {fmtDate(detected.next_expected)}</span>
              </div>
            )}
          </div>
          <button onClick={onToggle} className="text-gray-400 p-0.5 flex-shrink-0 mt-0.5">
            {expanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
          </button>
        </div>
        {expanded && (
          <div className="px-4 pb-4 pt-3 space-y-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
            <MetadataForm
              sub={sub}
              onSaved={row => onSubUpdated({ ...sub, ...(row as Partial<Subscription>), merchants: sub.merchants })}
            />
            <MerchantAliasManager
              sub={sub}
              onMerchantsChanged={merchants => onSubUpdated({ ...sub, merchants })}
            />
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Recent Transactions</h4>
              <TransactionsDrillDown subscriptionId={sub.id} />
            </div>
            <div className="border-t border-gray-200 pt-3 space-y-2">
              {otherSubs.length > 0 && (
                <button
                  onClick={() => setMergeOpen(true)}
                  className="text-xs text-gray-400 hover:text-red-600 underline underline-offset-2 block"
                >
                  Merge with another subscription…
                </button>
              )}
              {showCancelPanel ? (
                <CancelPanel
                  subId={sub.id}
                  defaultDate={detected?.last_charged}
                  onCancelled={updated => {
                    setShowCancelPanel(false)
                    onCancelled({ ...sub, ...updated, merchants: sub.merchants } as Subscription)
                  }}
                  onClose={() => setShowCancelPanel(false)}
                />
              ) : (
                <button
                  onClick={() => setShowCancelPanel(true)}
                  className="text-xs text-red-500 hover:underline block"
                >
                  Mark as cancelled…
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {mergeOpen && (
        <MergeModal
          sub={sub}
          otherSubs={otherSubs}
          onClose={() => setMergeOpen(false)}
          onMerged={targetName => { setMergeOpen(false); onMerged(targetName) }}
        />
      )}
    </>
  )
}

// ── Row: cancelled subscription ───────────────────────────────────────────────

function CancelledSubRow({
  sub,
  expanded,
  onToggle,
  onRestored,
}: {
  sub: Subscription
  expanded: boolean
  onToggle: () => void
  onRestored: (updated: Subscription) => void
}) {
  const [restoring, setRestoring] = useState(false)

  async function handleRestore() {
    setRestoring(true)
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}/restore`, { method: 'POST' })
      if (res.ok) {
        onRestored({ ...sub, is_active: true, cancelled_at: null, auto_cancelled: false })
      }
    } catch {
      // ignore
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden opacity-80">
      <div className="p-4 flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center mt-0.5">
          <ArchiveBoxIcon className="h-5 w-5 text-gray-400" />
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-700 text-sm">{sub.name}</div>
              {sub.merchants.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {sub.merchants.map(m => (
                    <span key={m} className="text-xs bg-gray-100 text-gray-400 rounded px-1.5 py-0.5">{m}</span>
                  ))}
                </div>
              )}
              <div className="text-xs text-gray-400 mt-1">
                {sub.cancelled_at ? `Cancelled ${fmtDate(sub.cancelled_at)}` : 'Cancelled'}
                {sub.auto_cancelled && <span className="ml-2">(auto-detected)</span>}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              {sub.lifetime_spend ? (
                <>
                  <div className="text-sm font-semibold text-gray-600">{fmtRounded(sub.lifetime_spend)}</div>
                  <div className="text-xs text-gray-400">lifetime</div>
                </>
              ) : (
                <span className="text-xs text-gray-400">—</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={handleRestore}
          disabled={restoring}
          className="text-xs text-blue-600 hover:underline flex-shrink-0 mt-1 disabled:opacity-50"
        >
          {restoring ? 'Restoring…' : 'Restore'}
        </button>
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Transaction History</h4>
          <TransactionsDrillDown subscriptionId={sub.id} />
        </div>
      )}
    </div>
  )
}

// ── Row: candidate ────────────────────────────────────────────────────────────

type CandidateMode = 'idle' | 'confirming' | 'cancelling'

function CandidateRow({
  sub,
  expanded,
  onToggle,
  onConfirmed,
  onDismiss,
  onAddedAsCancelled,
  accounts,
}: {
  sub: DetectedSubscription
  expanded: boolean
  onToggle: () => void
  onConfirmed: (newSub: Subscription) => void
  onDismiss: () => void
  onAddedAsCancelled: (newSub: Subscription) => void
  accounts: { id: string; display_name: string }[]
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [mode, setMode] = useState<CandidateMode>('idle')
  const [nameInput, setNameInput] = useState(sub.display_name)
  const [cancelDate, setCancelDate] = useState(sub.last_charged <= today ? sub.last_charged : today)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (done) return null

  async function handleConfirm() {
    const name = nameInput.trim()
    if (!name) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, initial_merchant: sub.merchant }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveError(data.error ?? 'Failed to add')
        return
      }
      setDone(true)
      onConfirmed(data.subscription)
    } catch {
      setSaveError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddAsCancelled() {
    const name = nameInput.trim()
    if (!name) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, initial_merchant: sub.merchant, is_active: false, cancelled_at: cancelDate }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveError(data.error ?? 'Failed to add')
        return
      }
      setDone(true)
      onAddedAsCancelled(data.subscription)
    } catch {
      setSaveError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDismiss() {
    setDone(true)
    onDismiss()
    await fetch('/api/mappings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: sub.merchant, classification: 'Not a subscription' }),
    }).catch(() => {})
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="p-4 flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center mt-0.5">
          <CalendarIcon className="h-5 w-5 text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <div className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <button onClick={onToggle} className="hover:underline text-left">{sub.display_name}</button>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${confidenceBadgeCls(sub.confidence)}`}>
                  {sub.confidence}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {accounts.find(a => a.id === sub.account_id)?.display_name ?? 'Unknown'} · {frequencyLabel(sub.frequency)} · {sub.occurrences} occurrences
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-bold text-gray-900 text-sm">{fmt(sub.amount)}</div>
              <div className="text-xs text-gray-400">{fmtRounded(sub.annual_estimate)}/yr</div>
            </div>
          </div>

          {mode === 'confirming' && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <input
                type="text"
                className="text-sm border border-gray-200 rounded px-2 py-1 flex-1 min-w-[140px]"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleConfirm()
                  if (e.key === 'Escape') { setMode('idle'); setSaveError(null) }
                }}
                autoFocus
                placeholder="Subscription name…"
              />
              <button
                onClick={handleConfirm}
                disabled={saving || !nameInput.trim()}
                className="text-xs bg-emerald-700 text-white rounded-full px-3 py-1 hover:bg-emerald-800 disabled:opacity-50"
              >
                {saving ? 'Adding…' : 'Add'}
              </button>
              <button
                onClick={() => { setMode('idle'); setSaveError(null) }}
                className="text-xs text-gray-500 border border-gray-200 rounded-full px-3 py-1 hover:bg-gray-50"
              >
                Cancel
              </button>
              {saveError && <span className="text-xs text-red-600 w-full mt-1">{saveError}</span>}
            </div>
          )}

          {mode === 'cancelling' && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  className="text-sm border border-gray-200 rounded px-2 py-1 flex-1 min-w-[140px]"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  autoFocus
                  placeholder="Subscription name…"
                />
                <label className="text-xs text-gray-500">Cancelled:</label>
                <input
                  type="date"
                  className="text-sm border border-gray-200 rounded px-2 py-1"
                  value={cancelDate}
                  max={today}
                  onChange={e => setCancelDate(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleAddAsCancelled}
                  disabled={saving || !nameInput.trim()}
                  className="text-xs bg-gray-700 text-white rounded-full px-3 py-1 hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? 'Adding…' : 'Add as cancelled'}
                </button>
                <button
                  onClick={() => { setMode('idle'); setSaveError(null) }}
                  className="text-xs text-gray-500 border border-gray-200 rounded-full px-3 py-1 hover:bg-gray-50"
                >
                  Cancel
                </button>
                {saveError && <span className="text-xs text-red-600">{saveError}</span>}
              </div>
            </div>
          )}

          {mode === 'idle' && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                onClick={() => { setMode('confirming'); setNameInput(sub.display_name) }}
                className="text-xs bg-emerald-700 text-white rounded-full px-3 py-1 hover:bg-emerald-800 transition-colors"
              >
                Add to my subscriptions
              </button>
              <button
                onClick={() => { setMode('cancelling'); setNameInput(sub.display_name) }}
                className="text-xs text-gray-600 border border-gray-300 rounded-full px-3 py-1 hover:bg-gray-50 transition-colors"
              >
                Add as cancelled
              </button>
              <button
                onClick={handleDismiss}
                className="text-xs text-gray-500 border border-gray-200 rounded-full px-3 py-1 hover:bg-gray-50 hover:text-gray-700 transition-colors"
              >
                Not a subscription
              </button>
              <button onClick={onToggle} className="text-xs text-blue-600 hover:underline ml-auto">
                {expanded ? 'Hide transactions ↑' : 'View transactions ↓'}
              </button>
            </div>
          )}
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Recent Transactions</h4>
          <TransactionsDrillDown merchant={sub.merchant} />
        </div>
      )}
    </div>
  )
}

// ── Row: dismissed merchant ───────────────────────────────────────────────────

function DismissedMerchantRow({
  merchant,
  onBroughtBack,
}: {
  merchant: string
  onBroughtBack: () => void
}) {
  async function handleBringBack() {
    onBroughtBack()
    await fetch(`/api/mappings?merchant=${encodeURIComponent(merchant)}`, { method: 'DELETE' }).catch(() => {})
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl opacity-70">
      <div className="p-3 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-600">{merchant}</div>
          <div className="text-xs text-gray-400 mt-0.5">Dismissed merchant</div>
        </div>
        <button onClick={handleBringBack} className="text-xs text-blue-600 hover:underline flex-shrink-0">
          Bring back
        </button>
      </div>
    </div>
  )
}

// ── Secondary section (Lapsed / Duplicates / Timeline) ───────────────────────

type SecondaryTab = 'lapsed' | 'duplicates' | 'timeline'

function SecondarySection({
  lapsed,
  duplicates,
  timeline,
  accounts,
}: {
  lapsed: DetectedSubscription[]
  duplicates: DuplicateSubscription[]
  timeline: TimelineItem[]
  accounts: { id: string; display_name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<SecondaryTab>('lapsed')
  const [dismissedDuplicates, setDismissedDuplicates] = useState<Set<string>>(new Set())

  const visibleDuplicates = duplicates.filter(d => !dismissedDuplicates.has(d.merchant))
  const totalMonthlyWaste = visibleDuplicates.reduce((s, d) => s + d.monthly_waste, 0)

  const now = new Date()
  const in7 = new Date()
  in7.setDate(in7.getDate() + 7)
  const next7Total = timeline
    .filter(item => new Date(item.expected_date + 'T00:00:00') <= in7)
    .reduce((s, item) => s + item.amount, 0)
  const next30Total = timeline.reduce((s, item) => s + item.amount, 0)

  const weekLabel = (d: string) => {
    const diff = Math.ceil((new Date(d + 'T00:00:00').getTime() - now.getTime()) / 86400000)
    if (diff <= 0) return 'Overdue'
    if (diff <= 7) return 'This week'
    if (diff <= 14) return 'Next week'
    if (diff <= 21) return 'In 2 weeks'
    return 'In 3–4 weeks'
  }
  const timelineGroups: Record<string, TimelineItem[]> = {}
  for (const item of timeline) {
    const label = weekLabel(item.expected_date)
    if (!timelineGroups[label]) timelineGroups[label] = []
    timelineGroups[label].push(item)
  }
  const weekOrder = ['Overdue', 'This week', 'Next week', 'In 2 weeks', 'In 3–4 weeks']

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <span>More analysis</span>
        {open ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            {([
              ['lapsed', `Lapsed (${lapsed.length})`],
              ['duplicates', `Duplicates${visibleDuplicates.length > 0 ? ` (${visibleDuplicates.length})` : ''}`],
              ['timeline', 'Timeline'],
            ] as [SecondaryTab, string][]).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'lapsed' && (
            lapsed.length === 0
              ? <p className="text-sm text-gray-400">No lapsed subscriptions.</p>
              : <div className="space-y-2">
                  {lapsed.map(sub => (
                    <div
                      key={sub.subscription_id ?? sub.merchant}
                      className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="text-sm font-medium text-gray-900">{sub.display_name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {frequencyLabel(sub.frequency)} · Last {fmtDate(sub.last_charged)}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-semibold text-gray-900">{fmt(sub.amount)}</div>
                        <div className="text-xs text-amber-600">Possibly cancelled</div>
                      </div>
                    </div>
                  ))}
                </div>
          )}

          {tab === 'duplicates' && (
            visibleDuplicates.length === 0
              ? <p className="text-sm text-gray-400">No duplicate subscriptions detected.</p>
              : <div className="space-y-3">
                  <p className="text-sm text-amber-700">
                    Total monthly waste: <strong>{fmtRounded(totalMonthlyWaste)}/mo</strong>
                  </p>
                  {visibleDuplicates.map(dup => (
                    <div key={dup.merchant} className="bg-white border border-amber-200 rounded-xl p-3">
                      <div className="font-semibold text-gray-900 text-sm mb-2">{dup.merchant}</div>
                      {dup.accounts.map(acc => (
                        <div key={acc.account_id} className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">
                            {accounts.find(a => a.id === acc.account_id)?.display_name ?? 'Unknown'}
                          </span>
                          <span className="font-medium">{fmt(acc.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-amber-100">
                        <span className="text-xs text-amber-700">Monthly waste: {fmtRounded(dup.monthly_waste)}</span>
                        <button
                          onClick={() => setDismissedDuplicates(p => { const n = new Set(p); n.add(dup.merchant); return n })}
                          className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-0.5"
                        >
                          Not a duplicate
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
          )}

          {tab === 'timeline' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-500">Due next 7 days</div>
                  <div className="text-xl font-bold text-gray-900 mt-1">{fmtRounded(next7Total)}</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-500">Due next 30 days</div>
                  <div className="text-xl font-bold text-gray-900 mt-1">{fmtRounded(next30Total)}</div>
                </div>
              </div>
              {timeline.length === 0
                ? <p className="text-sm text-gray-400">No subscriptions due in the next 30 days.</p>
                : weekOrder.filter(w => timelineGroups[w]).map(week => (
                    <div key={week}>
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{week}</h3>
                      <div className="space-y-2">
                        {timelineGroups[week].map((item, i) => (
                          <div
                            key={`${item.merchant}-${i}`}
                            className={`bg-white border rounded-xl p-3 flex items-center justify-between ${item.is_overdue ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}
                          >
                            <div>
                              <div className="text-sm font-medium text-gray-900">{item.merchant}</div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                {accounts.find(a => a.id === item.account_id)?.display_name ?? 'Unknown'} · {frequencyLabel(item.frequency)} · {fmtDate(item.expected_date)}
                                {item.is_overdue && <span className="ml-2 text-red-600 font-medium">overdue</span>}
                              </div>
                            </div>
                            <span className="text-sm font-semibold text-gray-900">{fmt(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
              }
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main client component ─────────────────────────────────────────────────────

type PrimaryTab = 'confirmed' | 'candidates' | 'cancelled' | 'dismissed'

export function SubscriptionsClient({
  activeSubscriptions,
  cancelledSubscriptions,
  candidateList: initialCandidates,
  detectedBySubId,
  dismissedMerchants,
  duplicates,
  timeline,
  accounts,
}: Props) {
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>('confirmed')
  const [activeSubs, setActiveSubs] = useState(activeSubscriptions)
  const [cancelledSubs, setCancelledSubs] = useState(cancelledSubscriptions)
  const [candidates, setCandidates] = useState(initialCandidates)
  const [dismissedMerchantList, setDismissedMerchantList] = useState(dismissedMerchants)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(null), 3500)
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id)
  }

  function handleSubUpdated(updated: Subscription) {
    setActiveSubs(prev => prev.map(s => s.id === updated.id ? updated : s))
  }

  function handleSubCancelled(updated: Subscription) {
    setActiveSubs(prev => prev.filter(s => s.id !== updated.id))
    setCancelledSubs(prev => [updated, ...prev])
    if (expandedId === updated.id) setExpandedId(null)
    showToast(`${updated.name} marked as cancelled`)
  }

  function handleSubRestored(updated: Subscription) {
    setCancelledSubs(prev => prev.filter(s => s.id !== updated.id))
    setActiveSubs(prev => [...prev, updated])
    showToast(`${updated.name} restored`)
  }

  function handleMerged(sourceId: string, targetName: string) {
    setActiveSubs(prev => prev.filter(s => s.id !== sourceId))
    if (expandedId === sourceId) setExpandedId(null)
    showToast(`Merged into ${targetName}`)
  }

  function handleCandidateConfirmed(merchant: string, newSub: Subscription) {
    setCandidates(prev => prev.filter(c => c.merchant !== merchant))
    setActiveSubs(prev => [...prev, newSub])
  }

  function handleCandidateAddedAsCancelled(merchant: string, newSub: Subscription) {
    setCandidates(prev => prev.filter(c => c.merchant !== merchant))
    setCancelledSubs(prev => [newSub, ...prev])
    showToast(`${newSub.name} added to cancelled history`)
  }

  function handleCandidateDismissed(merchant: string) {
    setCandidates(prev => prev.filter(c => c.merchant !== merchant))
    setDismissedMerchantList(prev => [...prev, merchant])
  }

  function handleMerchantBroughtBack(merchant: string) {
    setDismissedMerchantList(prev => prev.filter(m => m !== merchant))
  }

  const sortedActiveSubs = [...activeSubs].sort((a, b) => {
    const da = detectedBySubId[a.id]
    const db = detectedBySubId[b.id]
    if (da && db) return db.annual_estimate - da.annual_estimate
    if (da) return -1
    if (db) return 1
    return a.name.localeCompare(b.name)
  })

  const activeAnnual = activeSubs.reduce((s, sub) => {
    const d = detectedBySubId[sub.id]
    return s + (d && !d.is_lapsed ? d.annual_estimate : 0)
  }, 0)

  const cancelledLifetimeSpend = cancelledSubs.reduce((s, sub) => s + (sub.lifetime_spend ?? 0), 0)

  const lapsed = [
    ...Object.values(detectedBySubId).filter(d => d.is_lapsed),
    ...candidates.filter(c => c.is_lapsed),
  ]

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500">My subscriptions</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{activeSubs.length}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500">Annual cost</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{fmtRounded(activeAnnual)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500">Monthly equivalent</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{fmtRounded(activeAnnual / 12)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500">Candidates to review</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{candidates.length}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500">Cancelled ({cancelledSubs.length})</div>
          <div className="text-2xl font-bold text-gray-500 mt-1">{fmtRounded(cancelledLifetimeSpend)}</div>
          <div className="text-xs text-gray-400">lifetime spend</div>
        </div>
      </div>

      {/* Primary tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit overflow-x-auto">
        {([
          ['confirmed', `My Subscriptions (${activeSubs.length})`],
          ['candidates', `Detected Candidates${candidates.length > 0 ? ` (${candidates.length})` : ''}`],
          ['cancelled', `Cancelled${cancelledSubs.length > 0 ? ` (${cancelledSubs.length})` : ''}`],
          ['dismissed', `Dismissed merchants${dismissedMerchantList.length > 0 ? ` (${dismissedMerchantList.length})` : ''}`],
        ] as [PrimaryTab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setPrimaryTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              primaryTab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* My Subscriptions */}
      {primaryTab === 'confirmed' && (
        sortedActiveSubs.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <CheckCircleIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              No confirmed subscriptions yet. Review the Detected Candidates tab and add the ones you want to track.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedActiveSubs.map(sub => (
              <SubscriptionRow
                key={sub.id}
                sub={sub}
                detected={detectedBySubId[sub.id] ?? null}
                expanded={expandedId === sub.id}
                onToggle={() => toggleExpand(sub.id)}
                onCancelled={updated => handleSubCancelled(updated)}
                onSubUpdated={handleSubUpdated}
                onMerged={targetName => handleMerged(sub.id, targetName)}
                otherSubs={activeSubs.filter(s => s.id !== sub.id)}
                accounts={accounts}
              />
            ))}
          </div>
        )
      )}

      {/* Detected Candidates */}
      {primaryTab === 'candidates' && (
        candidates.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <CalendarIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              No unreviewed candidates. Import at least 2+ months of transactions to enable detection, or all detected merchants have been reviewed.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {candidates.map(sub => (
              <CandidateRow
                key={sub.merchant}
                sub={sub}
                expanded={expandedId === sub.merchant}
                onToggle={() => toggleExpand(sub.merchant)}
                onConfirmed={newSub => handleCandidateConfirmed(sub.merchant, newSub)}
                onDismiss={() => handleCandidateDismissed(sub.merchant)}
                onAddedAsCancelled={newSub => handleCandidateAddedAsCancelled(sub.merchant, newSub)}
                accounts={accounts}
              />
            ))}
          </div>
        )
      )}

      {/* Cancelled */}
      {primaryTab === 'cancelled' && (
        cancelledSubs.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <ArchiveBoxIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              No cancelled subscriptions. Use &ldquo;Mark as cancelled&hellip;&rdquo; on an active subscription to track cancellation history.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {cancelledSubs.map(sub => (
              <CancelledSubRow
                key={sub.id}
                sub={sub}
                expanded={expandedId === sub.id}
                onToggle={() => toggleExpand(sub.id)}
                onRestored={updated => handleSubRestored(updated)}
              />
            ))}
          </div>
        )
      )}

      {/* Dismissed merchants */}
      {primaryTab === 'dismissed' && (
        dismissedMerchantList.length === 0 ? (
          <p className="text-sm text-gray-400">No dismissed merchants yet.</p>
        ) : (
          <div className="space-y-1">
            {dismissedMerchantList.map(merchant => (
              <DismissedMerchantRow
                key={merchant}
                merchant={merchant}
                onBroughtBack={() => handleMerchantBroughtBack(merchant)}
              />
            ))}
          </div>
        )
      )}

      {/* More analysis */}
      <SecondarySection
        lapsed={lapsed}
        duplicates={duplicates}
        timeline={timeline}
        accounts={accounts}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
