'use client'

import { useState, useEffect, useCallback } from 'react'
import { CATEGORIES } from '@/lib/constants'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TrainingLabel {
  id: string
  merchant: string
  correct_category: string | null
  correct_classification: string | null
  is_income: boolean
  is_transfer: boolean
  is_subscription: boolean
  subscription_frequency: string | null
  notes: string | null
  status: 'pending' | 'confirmed' | 'actioned'
  suggested_rule: string | null
  holdout: boolean
  labelled_at: string
  transaction_count: number
  total_spend: number
  min_date: string | null
  max_date: string | null
  accounts: string[]
  suggested_classification: string | null
  dominant_category: string | null
  gl_category: string | null
}

interface EvalMetrics {
  total: number
  categoryAccuracy: number
  categoryCorrect: number
  transferAccuracy: number
  transferCorrect: number
  dollarWeightedAccuracy: number
  coverage: number
  covered: number
  failures: { merchant: string; detected: string | null; correct: string | null; spend: number }[]
  topUncovered: { merchant: string; spend: number }[]
}

interface EvalResult {
  benchmark: EvalMetrics | null
  holdout: EvalMetrics | null
  possibleOverfit: boolean
}

interface SubAuditRow {
  merchant: string
  count: number
  minDate: string
  maxDate: string
  medianIntervalDays: number | null
  autoDetected: boolean
  autoFrequency: string | null
  labelIsSubscription: boolean | null
  labelFrequency: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const aud = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)

const fmtDate = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

const FREQ_OPTIONS = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'annual']

const CLASSIFICATION_OPTIONS = ['Steven', 'Nicola', 'Joint', 'Business']

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  confirmed: 'bg-green-100 text-green-700',
  actioned: 'bg-blue-100 text-blue-700',
}

// ─── Example Card ────────────────────────────────────────────────────────────

function ExampleCard({ ex }: { ex: Record<string, unknown> }) {
  const account      = ex.account              as string | null
  const merchant     = (ex.merchant            as string | null) || (ex.description as string | null) || '—'
  const date         = ex.date                 as string | null
  const amount       = ex.amount               as number | null
  const source       = ex.source               as string | null
  const rawDesc      = ex.raw_description      as string | null
  const category     = ex.category             as string | null
  const classif      = ex.classification       as string | null
  const collapsedCount = (ex.collapsed_count   as number | null) ?? 1

  const transferDest = ex.transfer_destination as string | null

  // Credits (money IN): sender is FROM, receiver is TO — use transferDest if known, else merchant name
  // Debits (money OUT): sender is account (FROM), recipient is transferDest or merchant (TO)
  const isCredit = amount !== null && amount > 0
  const fromLabel = isCredit ? (transferDest ?? merchant) : (account || '—')
  const toLabel   = isCredit ? (account || '—') : (transferDest ?? merchant)

  const formattedDate = date
    ? new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

  const formattedAmount = amount !== null
    ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Math.abs(amount))
    : '—'

  const sourceLabel = source === 'xero' ? 'Xero' : 'CSV'

  return (
    <div className="text-xs bg-gray-50 border border-gray-100 rounded p-2.5">
      <div className="grid gap-x-3 gap-y-1" style={{ gridTemplateColumns: '5rem 1fr' }}>
        <span className="text-gray-400 uppercase tracking-wide text-[10px] pt-px">From</span>
        <span className="text-gray-700">{fromLabel}</span>

        <span className="text-gray-400 uppercase tracking-wide text-[10px] pt-px">To</span>
        <span className="text-gray-700 font-medium">{toLabel}</span>

        <span className="text-gray-400 uppercase tracking-wide text-[10px] pt-px">When</span>
        <span className="text-gray-700">{formattedDate}</span>

        <span className="text-gray-400 uppercase tracking-wide text-[10px] pt-px">Amount</span>
        <span className="flex items-center gap-1.5 text-gray-700">
          {formattedAmount}
          <span className={`font-medium rounded px-1 py-px ${isCredit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {isCredit ? 'CREDIT' : 'DEBIT'}
          </span>
          {collapsedCount > 1 && (
            <span className="font-medium rounded px-1 py-px bg-blue-100 text-blue-600" title={`${collapsedCount} identical transactions collapsed`}>
              ×{collapsedCount}
            </span>
          )}
        </span>

        <span className="text-gray-400 uppercase tracking-wide text-[10px] pt-px">Source</span>
        <span className="text-gray-700">{sourceLabel}</span>

        {category && (
          <>
            <span className="text-gray-400 uppercase tracking-wide text-[10px] pt-px">Category</span>
            <span className="text-gray-700">
              {category}
              {classif && <span className="ml-1.5 text-gray-400">· {classif}</span>}
            </span>
          </>
        )}

        {rawDesc && (
          <>
            <span className="text-gray-400 uppercase tracking-wide text-[10px] self-start pt-px">Raw</span>
            <span className="text-gray-600 whitespace-pre-wrap break-all">{rawDesc}</span>
          </>
        )}


      </div>
    </div>
  )
}

// ─── Rule Impact Modal ────────────────────────────────────────────────────────

function RuleImpactModal({ keyword, onClose }: { keyword: string; onClose: () => void }) {
  const [result, setResult] = useState<null | {
    matchCount: number; totalSpend: number; merchants: string[]; currentCategories: Record<string, number>
  }>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/dev/rule-impact?keyword=${encodeURIComponent(keyword)}`)
      .then(r => r.json())
      .then(d => setResult(d))
      .finally(() => setLoading(false))
  }, [keyword])

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Rule Impact: &ldquo;{keyword}&rdquo;</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
        </div>
        {loading ? (
          <div className="text-sm text-gray-400 py-4 text-center">Loading...</div>
        ) : result ? (
          <div className="text-sm space-y-2">
            <p>
              Matches <strong>{result.matchCount}</strong> transactions totalling{' '}
              <strong>{aud(result.totalSpend)}</strong> across{' '}
              <strong>{result.merchants.length}</strong> merchant{result.merchants.length !== 1 ? 's' : ''}.
            </p>
            {result.merchants.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Merchants matched:</div>
                <div className="text-xs bg-gray-50 rounded p-2 space-y-0.5 max-h-24 overflow-y-auto">
                  {result.merchants.map(m => <div key={m}>{m}</div>)}
                </div>
              </div>
            )}
            {Object.keys(result.currentCategories).length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Current categories:</div>
                <div className="text-xs space-y-0.5">
                  {Object.entries(result.currentCategories)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, cnt]) => (
                      <div key={cat} className="flex justify-between">
                        <span>{cat}</span>
                        <span className="text-gray-400">{cnt}×</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-red-500">Failed to load impact data.</div>
        )}
      </div>
    </div>
  )
}

// ─── Label Row ────────────────────────────────────────────────────────────────

function LabelRow({
  label,
  autoCategory,
  onSave,
  onSkip,
}: {
  label: TrainingLabel
  autoCategory: string | null
  onSave: (merchant: string, updates: Partial<TrainingLabel>) => Promise<void>
  onSkip: (merchant: string) => void
}) {
  const [local, setLocal] = useState({
    correct_category: label.correct_category,
    correct_classification: label.correct_classification ??
      (label.status === 'pending' ? label.suggested_classification : null),
    is_income: label.is_income,
    is_transfer: label.is_transfer,
    is_subscription: label.is_subscription,
    subscription_frequency: label.subscription_frequency,
    notes: label.notes || '',
    status: label.status,
    suggested_rule: label.suggested_rule,
  })
  const [savedFlash, setSavedFlash] = useState(false)
  const [ruleImpactKeyword, setRuleImpactKeyword] = useState<string | null>(null)
  const [examples, setExamples] = useState<Record<string, unknown>[] | null>(null)
  const [showExamples, setShowExamples] = useState(false)

  useEffect(() => {
    if (!showExamples) return
    fetch(`/api/dev/merchant-examples?merchant=${encodeURIComponent(label.merchant)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setExamples(d?.examples ?? null) })
      .catch(() => {})
  }, [label.merchant, showExamples])

  const hasMismatch = autoCategory !== null && local.correct_category !== null && autoCategory !== local.correct_category
  const suggestedKeyword = hasMismatch ? label.merchant.split(' ')[0] : null

  async function saveField(updates: Partial<typeof local>) {
    const newStatus = local.status === 'pending' ? 'confirmed' : local.status
    const merged = { ...local, ...updates }
    const newCat = merged.correct_category
    const suggested_rule = newCat && autoCategory && newCat !== autoCategory
      ? `'${label.merchant.split(' ')[0]}' → ${newCat}`
      : null
    const toSave = { ...merged, status: newStatus as TrainingLabel['status'], suggested_rule }
    setLocal(toSave)
    await onSave(label.merchant, toSave)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
  }

  return (
    <div className={`border rounded-xl p-4 ${label.holdout ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex gap-4 items-start">
      {/* Left: read-only context */}
      <div className="w-44 flex-shrink-0">
        <div className="font-semibold text-sm text-gray-900 break-words">{label.merchant}</div>
        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span>{label.transaction_count} txn{label.transaction_count !== 1 ? 's' : ''} · {aud(label.total_spend)}</span>
          {local.is_transfer
            ? <span className="font-medium rounded px-1.5 py-0.5 bg-gray-100 text-gray-500">TRANSFER</span>
            : local.is_income
              ? <span className="font-medium rounded px-1.5 py-0.5 bg-green-100 text-green-700">CREDIT</span>
              : <span className="font-medium rounded px-1.5 py-0.5 bg-red-100 text-red-700">DEBIT</span>
          }
        </div>
        <div className="text-xs text-gray-400">{fmtDate(label.min_date)}–{fmtDate(label.max_date)}</div>
        {label.accounts?.length > 0 && (
          <div className="text-xs text-gray-400 mt-0.5">Accounts: {label.accounts.join(', ')}</div>
        )}
        <div className="flex flex-wrap gap-1 mt-1">
          {label.holdout && <span className="text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">holdout</span>}
          <span className={`text-xs rounded px-1.5 py-0.5 ${STATUS_COLORS[local.status] || STATUS_COLORS.pending}`}>{local.status}</span>
          {savedFlash && <span className="text-xs text-emerald-600 font-medium">✓ Saved</span>}
        </div>
      </div>

      {/* Right: always-editable fields */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gray-400 whitespace-nowrap">Auto: {autoCategory ?? '—'}</span>
          <select
            value={local.correct_category || ''}
            onChange={e => saveField({ correct_category: e.target.value || null })}
            className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">— None —</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={local.correct_classification || ''}
            onChange={e => saveField({ correct_classification: e.target.value || null })}
            className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">—</option>
            {CLASSIFICATION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          {(['is_income', 'is_transfer', 'is_subscription'] as const).map(field => (
            <label key={field} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={local[field]}
                onChange={e => setLocal(l => ({ ...l, [field]: e.target.checked }))}
                className="rounded text-emerald-600"
              />
              {field === 'is_income' ? 'Income' : field === 'is_transfer' ? 'Transfer' : 'Subscription'}
            </label>
          ))}
          {local.is_subscription && (
            <select
              value={local.subscription_frequency || ''}
              onChange={e => saveField({ subscription_frequency: e.target.value || null })}
              className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Frequency...</option>
              {FREQ_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
        </div>

        <input
          type="text"
          value={local.notes}
          onChange={e => setLocal(l => ({ ...l, notes: e.target.value }))}
          onBlur={e => saveField({ notes: e.target.value })}
          placeholder="Notes..."
          className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />

        {local.status === 'pending' && (
          <div className="flex gap-2">
            <button
              onClick={() => saveField({})}
              className="text-sm bg-emerald-700 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-800 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => onSkip(label.merchant)}
              className="text-sm text-gray-400 hover:text-gray-600 rounded-lg px-3 py-1.5 border border-gray-200 hover:border-gray-300 transition-colors"
            >
              Skip
            </button>
          </div>
        )}

        {hasMismatch && (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 flex flex-wrap items-center gap-2">
            <span>⚠️ Was: <strong>{autoCategory}</strong> → Corrected to: <strong>{local.correct_category}</strong></span>
            {suggestedKeyword && (
              <>
                <span>· Suggested rule: &lsquo;{suggestedKeyword}&rsquo;</span>
                <button
                  onClick={() => navigator.clipboard.writeText(`'${suggestedKeyword}': '${local.correct_category}'`)}
                  className="bg-amber-100 hover:bg-amber-200 rounded px-1.5 py-0.5"
                >
                  Copy
                </button>
                <button
                  onClick={() => setRuleImpactKeyword(suggestedKeyword)}
                  className="bg-amber-100 hover:bg-amber-200 rounded px-1.5 py-0.5"
                >
                  Preview impact
                </button>
              </>
            )}
          </div>
        )}
      </div>

      </div>{/* end inner flex */}

      <div className="mt-2 pt-2 border-t border-gray-100">
        <button
          onClick={() => setShowExamples(s => !s)}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          {showExamples ? '▼ Hide details' : '▶ Show details'}
        </button>
        {showExamples && examples && examples.length > 0 && (
          <div className="mt-2 space-y-2">
            {examples.map((ex, i) => <ExampleCard key={i} ex={ex} />)}
          </div>
        )}
        </div>

      {ruleImpactKeyword && (
        <RuleImpactModal keyword={ruleImpactKeyword} onClose={() => setRuleImpactKeyword(null)} />
      )}
    </div>
  )
}

// ─── Evaluate Tab ─────────────────────────────────────────────────────────────

function EvaluateTab() {
  const [result, setResult] = useState<EvalResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHoldout, setShowHoldout] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function runEval() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dev/evaluate', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Evaluation failed'); return }
      setResult(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function exportFixtures() {
    setExporting(true)
    try {
      const res = await fetch('/api/dev/training-export')
      const text = await res.text()
      // Trigger download
      const blob = new Blob([text], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'groundTruth.fixtures.ts'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  function MetricsPanel({ metrics, title }: { metrics: EvalMetrics; title: string }) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <div>
            <div className="text-xs text-gray-500">Category accuracy</div>
            <div className="text-2xl font-bold text-gray-900">{(metrics.categoryAccuracy * 100).toFixed(0)}%</div>
            <div className="text-xs text-gray-400">{metrics.categoryCorrect}/{metrics.total} correct</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Dollar-weighted accuracy</div>
            <div className="text-2xl font-bold text-gray-900">{(metrics.dollarWeightedAccuracy * 100).toFixed(0)}%</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Transfer accuracy</div>
            <div className="text-2xl font-bold text-gray-900">{(metrics.transferAccuracy * 100).toFixed(0)}%</div>
            <div className="text-xs text-gray-400">{metrics.transferCorrect}/{metrics.total}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Rule coverage</div>
            <div className="text-2xl font-bold text-gray-900">{(metrics.coverage * 100).toFixed(0)}%</div>
            <div className="text-xs text-gray-400">{metrics.covered}/{metrics.total} have a rule</div>
          </div>
        </div>

        {metrics.failures.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Failures ({metrics.failures.length})</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-1.5 px-2 text-gray-500">Merchant</th>
                    <th className="text-left py-1.5 px-2 text-gray-500">Auto-detected</th>
                    <th className="text-left py-1.5 px-2 text-gray-500">Correct</th>
                    <th className="text-right py-1.5 px-2 text-gray-500">Spend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {metrics.failures.map(f => (
                    <tr key={f.merchant}>
                      <td className="py-1.5 px-2 text-gray-800">{f.merchant}</td>
                      <td className="py-1.5 px-2 text-red-600">{f.detected ?? 'null'}</td>
                      <td className="py-1.5 px-2 text-emerald-700">{f.correct ?? 'null'}</td>
                      <td className="py-1.5 px-2 text-right text-gray-600">{aud(f.spend)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {metrics.topUncovered.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Top uncovered merchants (no rule matches)</h4>
            <div className="space-y-1">
              {metrics.topUncovered.map(u => (
                <div key={u.merchant} className="text-xs flex justify-between text-gray-600">
                  <span>{u.merchant}</span>
                  <span className="text-gray-400">{aud(u.spend)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={runEval}
          disabled={loading}
          className="text-sm bg-emerald-700 text-white rounded-lg px-4 py-2 hover:bg-emerald-800 disabled:opacity-50"
        >
          {loading ? 'Running...' : 'Run evaluation'}
        </button>
        <button
          onClick={exportFixtures}
          disabled={exporting}
          className="text-sm bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
        >
          {exporting ? 'Exporting...' : 'Export as test fixtures'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {result && (
        <div className="space-y-4">
          {result.possibleOverfit && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm text-amber-800">
              ⚠️ Possible overfitting — rules may be too specific to benchmarked merchants. Holdout accuracy is &gt;10% below benchmark accuracy.
            </div>
          )}
          {result.benchmark && <MetricsPanel metrics={result.benchmark} title="Benchmark accuracy (80 non-holdout labels)" />}
          <div>
            <button
              onClick={() => setShowHoldout(h => !h)}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              {showHoldout ? '▼' : '▶'} Hold-out accuracy (20 reserved merchants)
            </button>
            {showHoldout && result.holdout && (
              <div className="mt-3">
                <MetricsPanel metrics={result.holdout} title="Hold-out set" />
              </div>
            )}
          </div>
        </div>
      )}

      {!result && !loading && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
          Click &ldquo;Run evaluation&rdquo; to compare auto-categorisation against your confirmed labels.
        </div>
      )}
    </div>
  )
}

// ─── Subscription Audit Tab ──────────────────────────────────────────────────

function SubscriptionAuditSection({ labels }: { labels: TrainingLabel[] }) {
  const [subRows, setSubRows] = useState<SubAuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/subscriptions')
      .then(r => r.json())
      .then(data => {
        const detected: { merchant: string; frequency: string; occurrences: number; last_charged: string }[] =
          data.subscriptions || []

        // Build from labels + detected
        const rows: SubAuditRow[] = []
        const seenMerchants = new Set<string>()

        for (const d of detected) {
          if (seenMerchants.has(d.merchant)) continue
          seenMerchants.add(d.merchant)
          const label = labels.find(l => l.merchant === d.merchant)
          rows.push({
            merchant: d.merchant,
            count: d.occurrences,
            minDate: '',
            maxDate: d.last_charged,
            medianIntervalDays: null,
            autoDetected: true,
            autoFrequency: d.frequency,
            labelIsSubscription: label?.is_subscription ?? null,
            labelFrequency: label?.subscription_frequency ?? null,
          })
        }

        // Add labelled-as-subscription that weren't auto-detected
        for (const l of labels) {
          if (l.is_subscription && !seenMerchants.has(l.merchant)) {
            rows.push({
              merchant: l.merchant,
              count: l.transaction_count,
              minDate: l.min_date || '',
              maxDate: l.max_date || '',
              medianIntervalDays: null,
              autoDetected: false,
              autoFrequency: null,
              labelIsSubscription: true,
              labelFrequency: l.subscription_frequency,
            })
          }
        }

        setSubRows(rows.sort((a, b) => b.count - a.count))
      })
      .finally(() => setLoading(false))
  }, [labels])

  async function updateSubLabel(merchant: string, isSubscription: boolean, frequency: string | null) {
    setSaving(merchant)
    setSubRows(prev => prev.map(r => r.merchant === merchant
      ? { ...r, labelIsSubscription: isSubscription, labelFrequency: frequency }
      : r
    ))
    await fetch('/api/dev/training-labels', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant, is_subscription: isSubscription, subscription_frequency: frequency }),
    })
    setSaving(null)
  }

  const truePositives = subRows.filter(r => r.autoDetected && r.labelIsSubscription === true).length
  const falsePositives = subRows.filter(r => r.autoDetected && r.labelIsSubscription === false).length
  const falseNegatives = subRows.filter(r => !r.autoDetected && r.labelIsSubscription === true).length
  const labelledSubs = subRows.filter(r => r.labelIsSubscription !== null)
  const precision = (truePositives + falsePositives) > 0 ? truePositives / (truePositives + falsePositives) : null
  const recall = (truePositives + falseNegatives) > 0 ? truePositives / (truePositives + falseNegatives) : null

  if (loading) return <div className="text-sm text-gray-400 p-4">Loading subscription data...</div>

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Subscription Audit</h3>
        <p className="text-xs text-gray-500 mb-4">
          Confirm or reject auto-detected subscriptions. Labels here feed the Evaluate tab&apos;s precision/recall metrics.
        </p>

        {labelledSubs.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
            <div>
              <div className="text-xs text-gray-500">Precision</div>
              <div className="text-xl font-bold">{precision !== null ? `${(precision * 100).toFixed(0)}%` : '—'}</div>
              <div className="text-xs text-gray-400">of detected, % correct</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Recall</div>
              <div className="text-xl font-bold">{recall !== null ? `${(recall * 100).toFixed(0)}%` : '—'}</div>
              <div className="text-xs text-gray-400">of actual subs, % found</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">False positives</div>
              <div className="text-xl font-bold text-red-600">{falsePositives}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Missed (false negatives)</div>
              <div className="text-xl font-bold text-amber-600">{falseNegatives}</div>
            </div>
          </div>
        )}

        <div className="divide-y divide-gray-100">
          {subRows.map(row => (
            <div key={row.merchant} className="py-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800">{row.merchant}</div>
                <div className="text-xs text-gray-400">
                  {row.count} occurrence{row.count !== 1 ? 's' : ''}
                  {row.autoDetected && <span className="ml-2 text-purple-600">Auto: {row.autoFrequency}</span>}
                  {!row.autoDetected && <span className="ml-2 text-gray-400 italic">not auto-detected</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-xs text-gray-500">Is subscription?</span>
                <button
                  onClick={() => updateSubLabel(row.merchant, true, row.labelFrequency)}
                  disabled={saving === row.merchant}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${row.labelIsSubscription === true ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-green-100'}`}
                >
                  Yes
                </button>
                <button
                  onClick={() => updateSubLabel(row.merchant, false, null)}
                  disabled={saving === row.merchant}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${row.labelIsSubscription === false ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-red-100'}`}
                >
                  No
                </button>
                {row.labelIsSubscription === true && (
                  <select
                    value={row.labelFrequency || ''}
                    onChange={e => updateSubLabel(row.merchant, true, e.target.value || null)}
                    disabled={saving === row.merchant}
                    className="text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none"
                  >
                    <option value="">Frequency...</option>
                    {FREQ_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>

        {subRows.length === 0 && (
          <div className="text-sm text-gray-400 text-center py-4">
            No subscription data yet. Seed training labels first.
          </div>
        )}
      </div>

      {falseNegatives > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-amber-800 mb-2">Missed subscriptions (false negatives)</h4>
          <div className="space-y-1">
            {subRows.filter(r => !r.autoDetected && r.labelIsSubscription === true).map(r => (
              <div key={r.merchant} className="text-xs text-gray-700 flex gap-2">
                <span>{r.merchant}</span>
                {r.labelFrequency && <span className="text-gray-400">({r.labelFrequency})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {falsePositives > 0 && (
        <div className="bg-white border border-red-200 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-red-800 mb-2">False positives (detected but not really subscriptions)</h4>
          <div className="space-y-1">
            {subRows.filter(r => r.autoDetected && r.labelIsSubscription === false).map(r => (
              <div key={r.merchant} className="text-xs text-gray-700">{r.merchant}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TrainingPage() {
  const [tab, setTab] = useState<'label' | 'evaluate' | 'subscriptions'>('label')
  const [labels, setLabels] = useState<TrainingLabel[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'actioned' | 'mismatches'>('all')
  const [seeding, setSeeding] = useState(false)
  const [seedResult, setSeedResult] = useState<string | null>(null)
  const [recentlyConfirmed, setRecentlyConfirmed] = useState<Set<string>>(new Set())
  const [skippedMerchants, setSkippedMerchants] = useState<Set<string>>(new Set())
  const [accountFilter, setAccountFilter] = useState<string>('')

  // Auto-category map (computed once)
  const [autoCatMap, setAutoCatMap] = useState<Record<string, string | null>>({})
  const [bulkConfirming, setBulkConfirming] = useState(false)

  const loadLabels = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dev/training-labels')
      const data = await res.json()
      const lbls: TrainingLabel[] = data.labels || []
      setLabels(lbls)

      // Compute auto-categories for all merchants
      // We call guessCategory on each merchant by fetching evaluate lightweight
      // For now, store null — the mismatch logic in LabelRow handles it inline
      const map: Record<string, string | null> = {}
      setAutoCatMap(map)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadLabels() }, [loadLabels])

  // Fetch auto-categories via evaluate endpoint
  useEffect(() => {
    if (labels.length === 0) return
    // Build auto-cat map by running client-side guessCategory simulation
    // Since we can't import server-side lib directly, we use the evaluate endpoint
    fetch('/api/dev/evaluate', { method: 'POST' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.allResults) return
        // Priority: GL account category (Xero source of truth) > dominant existing > keyword eval
        const map: Record<string, string | null> = {}
        // 1. Seed with dominant existing category
        for (const lbl of labels) {
          if (lbl.dominant_category) map[lbl.merchant] = lbl.dominant_category
        }
        // 2. Overlay with keyword-based evaluate results
        for (const r of data.allResults) {
          if (r.detectedCategory) map[r.merchant] = r.detectedCategory
        }
        // 3. Override with GL account category where available — highest confidence
        for (const lbl of labels) {
          if (lbl.gl_category) map[lbl.merchant] = lbl.gl_category
        }
        setAutoCatMap(map)
      })
      .catch(() => {})
  }, [labels.length])

  async function handleSave(merchant: string, updates: Partial<TrainingLabel>) {
    await fetch('/api/dev/training-labels', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant, ...updates }),
    })
    setLabels(prev => prev.map(l => l.merchant === merchant ? { ...l, ...updates } : l))
    if (updates.status === 'confirmed') {
      setRecentlyConfirmed(prev => { const next = new Set(prev); next.add(merchant); return next })
      setTimeout(() => {
        setRecentlyConfirmed(prev => {
          const next = new Set(prev)
          next.delete(merchant)
          return next
        })
      }, 1500)
    }
  }

  function handleSkip(merchant: string) {
    setSkippedMerchants(prev => { const next = new Set(prev); next.add(merchant); return next })
  }

  async function handleSeed() {
    setSeeding(true)
    setSeedResult(null)
    try {
      const res = await fetch('/api/dev/seed-training', { method: 'POST' })
      const data = await res.json()
      if (data.error) setSeedResult(`Error: ${data.error}`)
      else setSeedResult(`Seeded ${data.inserted} labels (${data.holdout} holdout). ${data.skipped ?? 0} already existed.`)
      await loadLabels()
    } finally {
      setSeeding(false)
    }
  }

  async function bulkConfirmAll() {
    // Confirm all pending labels where auto-cat is set and user hasn't overridden
    const toConfirm = nonHoldout.filter(l =>
      l.status === 'pending' && autoCatMap[l.merchant] != null
    ).map(l => ({
      merchant: l.merchant,
      correct_category: autoCatMap[l.merchant]!,
      correct_classification: l.correct_classification ?? l.suggested_classification ?? null,
    }))
    if (toConfirm.length === 0) return
    setBulkConfirming(true)
    try {
      await fetch('/api/dev/training-labels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirms: toConfirm }),
      })
      setLabels(prev => prev.map(l => {
        const match = toConfirm.find(c => c.merchant === l.merchant)
        if (!match) return l
        return { ...l, status: 'confirmed', correct_category: match.correct_category }
      }))
    } finally {
      setBulkConfirming(false)
    }
  }

  const nonHoldout = labels.filter(l => !l.holdout)
  const confirmed = nonHoldout.filter(l => l.status === 'confirmed').length
  const progressPct = nonHoldout.length > 0 ? Math.round((confirmed / nonHoldout.length) * 100) : 0

  const distinctAccounts = Array.from(
    new Set(nonHoldout.flatMap(l => l.accounts ?? []))
  ).sort()

  const filtered = nonHoldout.filter(l => {
    if (skippedMerchants.has(l.merchant) && !recentlyConfirmed.has(l.merchant)) return false
    if (accountFilter && !(l.accounts ?? []).includes(accountFilter)) return false
    if (filter === 'pending') return l.status === 'pending' || recentlyConfirmed.has(l.merchant)
    if (filter === 'confirmed') return l.status === 'confirmed'
    if (filter === 'actioned') return l.status === 'actioned'
    if (filter === 'mismatches') return l.status === 'confirmed' && autoCatMap[l.merchant] !== l.correct_category
    return true
  }).sort((a, b) => {
    // unconfirmed first, then by spend
    if (a.status === 'pending' && b.status !== 'pending') return -1
    if (b.status === 'pending' && a.status !== 'pending') return 1
    return b.total_spend - a.total_spend
  })

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Dev banner */}
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-sm text-purple-800">
          🔬 <strong>Ground Truth Training — Dev Only.</strong> Labels here are benchmarks, not rules.
          They measure accuracy; they do not set it.
        </div>

        {/* Seed control */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-gray-800">Seed training labels from transactions</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Pre-populates top 100 merchants. Idempotent — safe to run multiple times.
            </div>
            {seedResult && <div className="text-xs text-emerald-700 mt-1">{seedResult}</div>}
          </div>
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="text-sm bg-emerald-700 text-white rounded-lg px-3 py-2 hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap"
          >
            {seeding ? 'Seeding...' : 'Seed now'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit">
          {(['label', 'evaluate', 'subscriptions'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-emerald-700 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              {t === 'subscriptions' ? 'Subscription Audit' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Label tab */}
        {tab === 'label' && (
          <div className="space-y-4">
            {/* Progress */}
            {nonHoldout.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-medium text-gray-700">{confirmed} of {nonHoldout.length} confirmed ({progressPct}%)</span>
                  <span className="text-xs text-gray-400">{labels.filter(l => l.holdout).length} holdout reserved</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            )}

            {/* Filter bar */}
            <div className="flex flex-col gap-2">
            {distinctAccounts.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap">Account</label>
                <select
                  value={accountFilter}
                  onChange={e => setAccountFilter(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                >
                  <option value="">All accounts</option>
                  {distinctAccounts.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1 flex-wrap">
                {(['all', 'pending', 'confirmed', 'actioned', 'mismatches'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors capitalize ${filter === f ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400'}`}
                  >
                    {f === 'mismatches' ? 'Mismatches only' : f}
                  </button>
                ))}
              </div>
              {skippedMerchants.size > 0 && (
                <span className="text-xs text-gray-400">{skippedMerchants.size} skipped this session</span>
              )}
              {(() => {
                const confirmable = nonHoldout.filter(l => l.status === 'pending' && autoCatMap[l.merchant] != null).length
                return confirmable > 0 ? (
                  <button
                    onClick={bulkConfirmAll}
                    disabled={bulkConfirming}
                    className="ml-auto text-xs bg-emerald-700 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap"
                  >
                    {bulkConfirming ? 'Confirming...' : `Confirm all auto-matched (${confirmable})`}
                  </button>
                ) : null
              })()}
            </div>
            </div>{/* end filter bar */}

            {loading ? (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
                {labels.length === 0
                  ? 'No labels yet. Click "Seed now" to pre-populate from your transactions.'
                  : `No ${filter === 'all' ? '' : filter} labels found.`}
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(label => (
                  <div key={label.merchant} className="relative">
                    <LabelRow
                      label={label}
                      autoCategory={autoCatMap[label.merchant] ?? null}
                      onSave={handleSave}
                      onSkip={handleSkip}
                    />
                    {filter === 'pending' && recentlyConfirmed.has(label.merchant) && (
                      <div className="absolute inset-0 flex items-center justify-center bg-green-500/10 rounded-xl pointer-events-none">
                        <span className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-md">
                          ✓ Confirmed!
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Evaluate tab */}
        {tab === 'evaluate' && <EvaluateTab />}

        {/* Subscription audit tab */}
        {tab === 'subscriptions' && <SubscriptionAuditSection labels={labels} />}
      </div>
    </div>
  )
}
