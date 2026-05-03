'use client'

import { useState, useEffect } from 'react'
import { DetectedSubscription, SubscriptionMetadata } from '@/lib/types'
import { CalendarIcon, CheckCircleIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

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
  allDetected: DetectedSubscription[]
  confirmedMerchants: string[]
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
  classification: string | null
  gl_account: string | null
  external_id: string | null
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

// ── Expand panel: lazy-load transactions + metadata ──────────────────────────

function TransactionsDrillDown({ merchant }: { merchant: string }) {
  const [txns, setTxns] = useState<DrillDownTx[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/subscriptions/transactions?merchant=${encodeURIComponent(merchant)}`)
      .then(r => r.json())
      .then(d => { setTxns(d.transactions ?? []); setLoading(false) })
      .catch(() => { setError('Failed to load transactions'); setLoading(false) })
  }, [merchant])

  if (loading) return <p className="text-xs text-gray-400 py-2">Loading transactions…</p>
  if (error) return <p className="text-xs text-red-500 py-2">{error}</p>
  if (!txns || txns.length === 0) return <p className="text-xs text-gray-400 py-2">No transactions found for this merchant.</p>

  return (
    <div className="overflow-x-auto rounded border border-gray-100 mt-1">
      <table className="min-w-full text-xs divide-y divide-gray-100">
        <thead className="bg-gray-50">
          <tr>
            {['Date', 'Amount', 'Raw description', 'Account', 'Category'].map(h => (
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
              <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{tx.account_name ?? '—'}</td>
              <td className="px-3 py-1.5 text-gray-500">{tx.category ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface MetaFormState {
  cancellation_url: string
  account_email: string
  notes: string
  auto_renews: boolean
  next_renewal_override: string
  category: string
}

function defaultFormState(meta?: SubscriptionMetadata | null): MetaFormState {
  return {
    cancellation_url: meta?.cancellation_url ?? '',
    account_email: meta?.account_email ?? '',
    notes: meta?.notes ?? '',
    auto_renews: meta?.auto_renews ?? true,
    next_renewal_override: meta?.next_renewal_override ?? '',
    category: meta?.category ?? '',
  }
}

function MetadataForm({ merchant }: { merchant: string }) {
  const [loading, setLoading] = useState(true)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [form, setForm] = useState<MetaFormState>(defaultFormState())

  useEffect(() => {
    fetch(`/api/subscriptions/metadata?merchant=${encodeURIComponent(merchant)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setForm(defaultFormState(data)); setLoading(false) })
      .catch(() => setLoading(false))
  }, [merchant])

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/subscriptions/metadata', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant,
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
        setSavedAt(new Date().toLocaleTimeString('en-AU'))
      }
    } catch {
      setSaveError('Network error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-xs text-gray-400 py-2">Loading metadata…</p>

  const field = (label: string, name: keyof MetaFormState, type = 'text') => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-0.5">{label}</label>
      {type === 'textarea' ? (
        <textarea
          className="w-full text-sm border border-gray-200 rounded px-2 py-1 resize-none"
          rows={2}
          value={form[name] as string}
          onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
        />
      ) : (
        <input
          type={type}
          className="w-full text-sm border border-gray-200 rounded px-2 py-1"
          value={form[name] as string}
          onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
        />
      )}
    </div>
  )

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Metadata</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-0.5">Cancellation URL</label>
          <div className="flex items-center gap-1">
            <input
              type="url"
              className="flex-1 text-sm border border-gray-200 rounded px-2 py-1"
              value={form.cancellation_url}
              onChange={e => setForm(f => ({ ...f, cancellation_url: e.target.value }))}
              placeholder="https://..."
            />
            {form.cancellation_url && (
              <a href={form.cancellation_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline whitespace-nowrap">Open ↗</a>
            )}
          </div>
        </div>
        {field('Account email', 'account_email', 'email')}
        {field('Category', 'category')}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-0.5">Next renewal override</label>
          <input type="date" className="w-full text-sm border border-gray-200 rounded px-2 py-1" value={form.next_renewal_override} onChange={e => setForm(f => ({ ...f, next_renewal_override: e.target.value }))} />
        </div>
        <div className="flex items-center gap-2 pt-4">
          <input type="checkbox" id={`ar-${merchant}`} checked={form.auto_renews} onChange={e => setForm(f => ({ ...f, auto_renews: e.target.checked }))} className="rounded" />
          <label htmlFor={`ar-${merchant}`} className="text-sm text-gray-700">Auto-renews</label>
        </div>
      </div>
      <div className="col-span-2">{field('Notes', 'notes', 'textarea')}</div>
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

function ExpandPanel({ merchant, showMetadata }: { merchant: string; showMetadata: boolean }) {
  return (
    <div className="px-4 pb-4 pt-2 space-y-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
      {showMetadata && <MetadataForm merchant={merchant} />}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Recent Transactions</h4>
        <TransactionsDrillDown merchant={merchant} />
      </div>
    </div>
  )
}

// ── Row: confirmed subscription ───────────────────────────────────────────────

function ConfirmedRow({
  merchant,
  detected,
  expanded,
  onToggle,
  accounts,
}: {
  merchant: string
  detected: DetectedSubscription | null
  expanded: boolean
  onToggle: () => void
  accounts: { id: string; display_name: string }[]
}) {
  const noActivity = !detected

  return (
    <div className={`bg-white border rounded-xl overflow-hidden ${noActivity ? 'border-gray-200 opacity-75' : 'border-gray-200'}`}>
      <div className="p-4 flex items-start gap-3 cursor-pointer hover:bg-gray-50" onClick={onToggle}>
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center mt-0.5">
          <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <div className="font-semibold text-gray-900 text-sm">{merchant}</div>
              <div className="text-xs text-gray-500 mt-0.5">
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
              {detected.is_lapsed && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Possibly cancelled</span>
              )}
            </div>
          )}
        </div>
        <div className="flex-shrink-0 text-gray-400 mt-1">
          {expanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
        </div>
      </div>
      {expanded && <ExpandPanel merchant={merchant} showMetadata={true} />}
    </div>
  )
}

// ── Row: candidate ────────────────────────────────────────────────────────────

function CandidateRow({
  sub,
  expanded,
  onToggle,
  onConfirm,
  onDismiss,
  accounts,
}: {
  sub: DetectedSubscription
  expanded: boolean
  onToggle: () => void
  onConfirm: () => void
  onDismiss: () => void
  accounts: { id: string; display_name: string }[]
}) {
  const [actionDone, setActionDone] = useState<'confirmed' | 'dismissed' | null>(null)

  function handleConfirm() {
    setActionDone('confirmed')
    onConfirm()
  }
  function handleDismiss() {
    setActionDone('dismissed')
    onDismiss()
  }

  if (actionDone === 'dismissed') return null

  return (
    <div className={`bg-white border border-gray-200 rounded-xl overflow-hidden ${actionDone === 'confirmed' ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="p-4 flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center mt-0.5">
          <CalendarIcon className="h-5 w-5 text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <div className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                <button onClick={onToggle} className="hover:underline text-left">{sub.merchant}</button>
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
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {actionDone === 'confirmed' ? (
              <span className="text-xs text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">✓ Added</span>
            ) : (
              <>
                <button
                  onClick={handleConfirm}
                  className="text-xs bg-emerald-700 text-white rounded-full px-3 py-1 hover:bg-emerald-800 transition-colors"
                >
                  Add to my subscriptions
                </button>
                <button
                  onClick={handleDismiss}
                  className="text-xs text-gray-500 border border-gray-200 rounded-full px-3 py-1 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                >
                  Not a subscription
                </button>
              </>
            )}
            <button
              onClick={onToggle}
              className="text-xs text-blue-600 hover:underline ml-auto"
            >
              {expanded ? 'Hide transactions ↑' : 'View transactions ↓'}
            </button>
          </div>
        </div>
      </div>
      {expanded && <ExpandPanel merchant={sub.merchant} showMetadata={false} />}
    </div>
  )
}

// ── Row: dismissed ────────────────────────────────────────────────────────────

function DismissedRow({
  merchant,
  expanded,
  onToggle,
  onBringBack,
}: {
  merchant: string
  expanded: boolean
  onToggle: () => void
  onBringBack: () => void
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden opacity-70">
      <div className="p-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <button onClick={onToggle} className="text-sm font-medium text-gray-600 hover:underline text-left">{merchant}</button>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={onBringBack} className="text-xs text-blue-600 hover:underline">Bring back</button>
              <button onClick={onToggle} className="text-gray-400">
                {expanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
      {expanded && <ExpandPanel merchant={merchant} showMetadata={false} />}
    </div>
  )
}

// ── Secondary tabs (Lapsed / Duplicates / Timeline) ──────────────────────────

type SecondaryTab = 'lapsed' | 'duplicates' | 'timeline'

function SecondarySection({
  allDetected,
  dismissedSet,
  duplicates,
  timeline,
  accounts,
}: {
  allDetected: DetectedSubscription[]
  dismissedSet: Set<string>
  duplicates: DuplicateSubscription[]
  timeline: TimelineItem[]
  accounts: { id: string; display_name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<SecondaryTab>('lapsed')
  const [dismissedDuplicates, setDismissedDuplicates] = useState<Set<string>>(new Set())

  const lapsed = allDetected.filter(s => s.is_lapsed && !dismissedSet.has(s.merchant))
  const visibleDuplicates = duplicates.filter(d => !dismissedDuplicates.has(d.merchant))
  const totalMonthlyWaste = visibleDuplicates.reduce((s, d) => s + d.monthly_waste, 0)

  const now = new Date()
  const in7 = new Date()
  in7.setDate(in7.getDate() + 7)
  const next7Total = timeline.filter(item => new Date(item.expected_date + 'T00:00:00') <= in7).reduce((s, item) => s + item.amount, 0)
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
          {/* Tab bar */}
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

          {/* Lapsed */}
          {tab === 'lapsed' && (
            lapsed.length === 0
              ? <p className="text-sm text-gray-400">No lapsed subscriptions.</p>
              : <div className="space-y-2">
                  {lapsed.map(sub => (
                    <div key={sub.merchant} className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{sub.merchant}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{frequencyLabel(sub.frequency)} · Last {fmtDate(sub.last_charged)}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-semibold text-gray-900">{fmt(sub.amount)}</div>
                        <div className="text-xs text-amber-600">Possibly cancelled</div>
                      </div>
                    </div>
                  ))}
                </div>
          )}

          {/* Duplicates */}
          {tab === 'duplicates' && (
            visibleDuplicates.length === 0
              ? <p className="text-sm text-gray-400">No duplicate subscriptions detected.</p>
              : <div className="space-y-3">
                  <p className="text-sm text-amber-700">Total monthly waste: <strong>{fmtRounded(totalMonthlyWaste)}/mo</strong></p>
                  {visibleDuplicates.map(dup => (
                    <div key={dup.merchant} className="bg-white border border-amber-200 rounded-xl p-3">
                      <div className="font-semibold text-gray-900 text-sm mb-2">{dup.merchant}</div>
                      {dup.accounts.map(acc => (
                        <div key={acc.account_id} className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">{accounts.find(a => a.id === acc.account_id)?.display_name ?? 'Unknown'}</span>
                          <span className="font-medium">{fmt(acc.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-amber-100">
                        <span className="text-xs text-amber-700">Monthly waste: {fmtRounded(dup.monthly_waste)}</span>
                        <button
                          onClick={() => setDismissedDuplicates(p => { const n = new Set(p); n.add(dup.merchant); return n })}
                          className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-0.5"
                        >Not a duplicate</button>
                      </div>
                    </div>
                  ))}
                </div>
          )}

          {/* Timeline */}
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
                          <div key={`${item.merchant}-${i}`} className={`bg-white border rounded-xl p-3 flex items-center justify-between ${item.is_overdue ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
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

type PrimaryTab = 'confirmed' | 'candidates' | 'dismissed'

export function SubscriptionsClient({
  allDetected,
  confirmedMerchants,
  dismissedMerchants,
  duplicates,
  timeline,
  accounts,
}: Props) {
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>('confirmed')
  const [confirmedSet, setConfirmedSet] = useState(() => new Set(confirmedMerchants))
  const [dismissedSet, setDismissedSet] = useState(() => new Set(dismissedMerchants))
  const [expandedMerchant, setExpandedMerchant] = useState<string | null>(null)

  function toggleExpand(merchant: string) {
    setExpandedMerchant(prev => prev === merchant ? null : merchant)
  }

  async function handleConfirm(merchant: string) {
    setConfirmedSet(prev => { const n = new Set(prev); n.add(merchant); return n })
    setDismissedSet(prev => { const n = new Set(prev); n.delete(merchant); return n })
    await fetch('/api/mappings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant, classification: 'Subscription' }),
    }).catch(() => {})
  }

  async function handleDismiss(merchant: string) {
    setDismissedSet(prev => { const n = new Set(prev); n.add(merchant); return n })
    setConfirmedSet(prev => { const n = new Set(prev); n.delete(merchant); return n })
    if (expandedMerchant === merchant) setExpandedMerchant(null)
    await fetch('/api/mappings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant, classification: 'Not a subscription' }),
    }).catch(() => {})
  }

  async function handleBringBack(merchant: string) {
    setDismissedSet(prev => { const n = new Set(prev); n.delete(merchant); return n })
    await fetch(`/api/mappings?merchant=${encodeURIComponent(merchant)}`, {
      method: 'DELETE',
    }).catch(() => {})
  }

  // Derived lists
  const detectedMap = new Map(allDetected.map(d => [d.merchant, d]))

  const confirmedList = Array.from(confirmedSet)
  const confirmedWithDetection = confirmedList.map(m => ({ merchant: m, detected: detectedMap.get(m) ?? null }))
  const candidateList = allDetected.filter(d => !confirmedSet.has(d.merchant) && !dismissedSet.has(d.merchant))
  const dismissedList = Array.from(dismissedSet)

  // Sort confirmed: detected (by annual est desc) first, then undetected alphabetically
  confirmedWithDetection.sort((a, b) => {
    if (a.detected && b.detected) return b.detected.annual_estimate - a.detected.annual_estimate
    if (a.detected) return -1
    if (b.detected) return 1
    return a.merchant.localeCompare(b.merchant)
  })

  const activeAnnual = confirmedList.reduce((s, m) => {
    const d = detectedMap.get(m)
    return s + (d && !d.is_lapsed ? d.annual_estimate : 0)
  }, 0)

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500">My subscriptions</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{confirmedList.length}</div>
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
          <div className="text-2xl font-bold text-amber-600 mt-1">{candidateList.length}</div>
        </div>
      </div>

      {/* Primary tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit overflow-x-auto">
        {([
          ['confirmed', `My Subscriptions (${confirmedList.length})`],
          ['candidates', `Detected Candidates${candidateList.length > 0 ? ` (${candidateList.length})` : ''}`],
          ['dismissed', `Dismissed${dismissedList.length > 0 ? ` (${dismissedList.length})` : ''}`],
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
        confirmedWithDetection.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <CheckCircleIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No confirmed subscriptions yet. Review the Detected Candidates tab and add the ones you want to track.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {confirmedWithDetection.map(({ merchant, detected }) => (
              <ConfirmedRow
                key={merchant}
                merchant={merchant}
                detected={detected}
                expanded={expandedMerchant === merchant}
                onToggle={() => toggleExpand(merchant)}
                accounts={accounts}
              />
            ))}
          </div>
        )
      )}

      {/* Detected Candidates */}
      {primaryTab === 'candidates' && (
        candidateList.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <CalendarIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No unreviewed candidates. Import at least 2+ months of transactions to enable detection, or all detected merchants have been reviewed.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {candidateList.map(sub => (
              <CandidateRow
                key={sub.merchant}
                sub={sub}
                expanded={expandedMerchant === sub.merchant}
                onToggle={() => toggleExpand(sub.merchant)}
                onConfirm={() => handleConfirm(sub.merchant)}
                onDismiss={() => handleDismiss(sub.merchant)}
                accounts={accounts}
              />
            ))}
          </div>
        )
      )}

      {/* Dismissed */}
      {primaryTab === 'dismissed' && (
        dismissedList.length === 0 ? (
          <p className="text-sm text-gray-400">No dismissed merchants.</p>
        ) : (
          <div className="space-y-1">
            {dismissedList.map(merchant => (
              <DismissedRow
                key={merchant}
                merchant={merchant}
                expanded={expandedMerchant === merchant}
                onToggle={() => toggleExpand(merchant)}
                onBringBack={() => handleBringBack(merchant)}
              />
            ))}
          </div>
        )
      )}

      {/* More analysis (Lapsed / Duplicates / Timeline) */}
      <SecondarySection
        allDetected={allDetected}
        dismissedSet={dismissedSet}
        duplicates={duplicates}
        timeline={timeline}
        accounts={accounts}
      />
    </div>
  )
}
