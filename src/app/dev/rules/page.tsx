'use client'

import { useState, useEffect } from 'react'

// ─── Types (mirror API response shape) ──────────────────────────────────────

interface RuleSummary {
  totalWithRule: number
  unmatchedCategorised: number
}

interface DirectorIncomeRule {
  id: string
  pattern: string
  category: string
  description: string
  hits: number
}

interface XeroTransferRule {
  id: string
  isTransfer: boolean
  category: string | null
  needsReview: boolean
  description: string
  hits: number
}

interface MerchantCategoryRule {
  id: string
  name: string
  description: string
  category: string | null
  isTransfer: boolean
  hits: number
}

interface TransferPatternGroup {
  id: string
  description: string
  patternCount: number
  patterns: string[]
  hits: number
}

interface RulesData {
  summary: RuleSummary
  hitCounts: Record<string, number>
  rules: {
    directorIncome: DirectorIncomeRule[]
    xeroTransfer: XeroTransferRule[]
    merchantCategory: MerchantCategoryRule[]
    transferPattern: TransferPatternGroup
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function HitBadge({ hits }: { hits: number }) {
  if (hits === 0) {
    return (
      <span className="text-xs rounded px-2 py-0.5 bg-gray-100 text-gray-400">0 hits</span>
    )
  }
  return (
    <span className="text-xs rounded px-2 py-0.5 bg-emerald-100 text-emerald-700 font-medium">
      {hits.toLocaleString()} hit{hits !== 1 ? 's' : ''}
    </span>
  )
}

function OutcomeBadge({ category, isTransfer, needsReview }: { category: string | null; isTransfer: boolean; needsReview?: boolean }) {
  if (needsReview) {
    return <span className="text-xs rounded px-2 py-0.5 bg-amber-100 text-amber-700 font-medium">⚠ needs review</span>
  }
  if (isTransfer) {
    return <span className="text-xs rounded px-2 py-0.5 bg-gray-100 text-gray-600 font-medium">TRANSFER</span>
  }
  if (!category) {
    return <span className="text-xs rounded px-2 py-0.5 bg-gray-100 text-gray-400">—</span>
  }
  return <span className="text-xs rounded px-2 py-0.5 bg-blue-100 text-blue-700 font-medium">{category}</span>
}

function SectionHeader({ title, count, totalHits }: { title: string; count: number; totalHits: number }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <span className="text-xs text-gray-400">{count} rule{count !== 1 ? 's' : ''}</span>
      {totalHits > 0 && (
        <span className="text-xs text-emerald-600 font-medium">{totalHits.toLocaleString()} total hits</span>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RulesPage() {
  const [data, setData] = useState<RulesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPatterns, setShowPatterns] = useState(false)

  useEffect(() => {
    fetch('/api/dev/rules')
      .then(r => r.ok ? r.json() : r.json().then((d: { error?: string }) => { throw new Error(d.error ?? 'Failed') }))
      .then(setData)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-sm text-gray-400">Loading rules...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">
          {error ?? 'Unknown error'}
        </div>
      </div>
    )
  }

  const { summary, rules } = data

  const directorHits = rules.directorIncome.reduce((s, r) => s + r.hits, 0)
  const xeroHits = rules.xeroTransfer.reduce((s, r) => s + r.hits, 0)
  const merchantHits = rules.merchantCategory.reduce((s, r) => s + r.hits, 0)
  const totalRules = rules.directorIncome.length + rules.xeroTransfer.length + rules.merchantCategory.length + 1

  const coveragePct = (summary.totalWithRule + summary.unmatchedCategorised) > 0
    ? Math.round(summary.totalWithRule / (summary.totalWithRule + summary.unmatchedCategorised) * 100)
    : 0

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-sm text-purple-800">
          📋 <strong>Categorisation Rules — Dev Only.</strong> Every codified rule in the system, with live hit counts from the transactions table.
        </div>

        {/* Summary */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-gray-500">Total rules</div>
              <div className="text-2xl font-bold text-gray-900">{totalRules}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Transactions matched by a rule</div>
              <div className="text-2xl font-bold text-gray-900">{summary.totalWithRule.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Categorised without a rule</div>
              <div className="text-2xl font-bold text-gray-900">{summary.unmatchedCategorised.toLocaleString()}</div>
              <div className="text-xs text-gray-400">keyword / mapping / hint</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Rule coverage</div>
              <div className="text-2xl font-bold text-gray-900">{coveragePct}%</div>
              <div className="text-xs text-gray-400">of categorised transactions</div>
            </div>
          </div>
        </div>

        {/* Director Income Rules */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <SectionHeader title="Director Income Rules" count={rules.directorIncome.length} totalHits={directorHits} />
          <p className="text-xs text-gray-500 mb-4">
            Applied first in processBatch, before transfer detection. Identifies credits from the business as Salary or Director Income.
          </p>
          <div className="divide-y divide-gray-100">
            {rules.directorIncome.map(rule => (
              <div key={rule.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-mono text-xs bg-violet-100 text-violet-700 rounded px-1.5 py-0.5">{rule.id}</span>
                    <OutcomeBadge category={rule.category} isTransfer={false} />
                    <HitBadge hits={rule.hits} />
                  </div>
                  <div className="text-sm text-gray-700">{rule.description}</div>
                  <div className="text-xs text-gray-400 mt-0.5 font-mono">{rule.pattern}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Xero Transfer Rules */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <SectionHeader title="Xero Transfer Rules" count={rules.xeroTransfer.length} totalHits={xeroHits} />
          <p className="text-xs text-gray-500 mb-4">
            Applied only to Xero SPEND-TRANSFER transactions. Classifies outgoing bank transfers by destination account and narration keywords.
          </p>
          <div className="divide-y divide-gray-100">
            {rules.xeroTransfer.map(rule => (
              <div key={rule.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-mono text-xs bg-violet-100 text-violet-700 rounded px-1.5 py-0.5">{rule.id}</span>
                    <OutcomeBadge category={rule.category} isTransfer={rule.isTransfer} needsReview={rule.needsReview} />
                    <HitBadge hits={rule.hits} />
                  </div>
                  <div className="text-sm text-gray-700">{rule.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Merchant Category Rules */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <SectionHeader title="Merchant Category Rules" count={rules.merchantCategory.length} totalHits={merchantHits} />
          <p className="text-xs text-gray-500 mb-4">
            Named, testable rules keyed on merchant name. Evaluated after director income and transfer checks. First match wins.
          </p>
          <div className="divide-y divide-gray-100">
            {rules.merchantCategory.map(rule => (
              <div key={rule.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-mono text-xs bg-violet-100 text-violet-700 rounded px-1.5 py-0.5">{rule.id}</span>
                    <OutcomeBadge category={rule.category} isTransfer={rule.isTransfer} />
                    <HitBadge hits={rule.hits} />
                  </div>
                  <div className="text-sm text-gray-700">{rule.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Transfer Pattern Group */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <SectionHeader title="Transfer Patterns" count={1} totalHits={rules.transferPattern.hits} />
          <p className="text-xs text-gray-500 mb-4">
            {rules.transferPattern.description} All {rules.transferPattern.patternCount} patterns share the single rule ID{' '}
            <span className="font-mono bg-violet-100 text-violet-700 rounded px-1">transfer-pattern</span>.
          </p>
          <div className="flex items-center gap-3 mb-3">
            <OutcomeBadge category={null} isTransfer={true} />
            <HitBadge hits={rules.transferPattern.hits} />
          </div>
          <button
            onClick={() => setShowPatterns(p => !p)}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            {showPatterns ? '▼ Hide' : '▶ Show'} all {rules.transferPattern.patternCount} patterns
          </button>
          {showPatterns && (
            <div className="mt-2 bg-gray-50 rounded-lg p-3 space-y-1">
              {rules.transferPattern.patterns.map((p, i) => (
                <div key={i} className="font-mono text-xs text-gray-600">{p}</div>
              ))}
            </div>
          )}
        </div>

        {/* Zero-hit rules callout */}
        {(() => {
          const allRules = [
            ...rules.directorIncome,
            ...rules.xeroTransfer,
            ...rules.merchantCategory,
          ]
          const zeroHit = allRules.filter(r => r.hits === 0)
          if (zeroHit.length === 0) return null
          return (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-amber-800 mb-2">
                {zeroHit.length} rule{zeroHit.length !== 1 ? 's' : ''} with no hits yet
              </h3>
              <p className="text-xs text-amber-700 mb-2">
                These rules have never matched a transaction. They may be correct (just no data yet) or may need reviewing.
              </p>
              <div className="space-y-0.5">
                {zeroHit.map(r => (
                  <div key={r.id} className="font-mono text-xs text-amber-700">{r.id}</div>
                ))}
              </div>
            </div>
          )
        })()}

      </div>
    </div>
  )
}
