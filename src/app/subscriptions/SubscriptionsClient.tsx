'use client'

import { useState } from 'react'
import { DetectedSubscription } from '@/lib/types'
import { CalendarIcon, ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline'

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
  subscriptions: DetectedSubscription[]
  duplicates: DuplicateSubscription[]
  timeline: TimelineItem[]
  accounts: { id: string; display_name: string }[]
}

type Tab = 'active' | 'lapsed' | 'all' | 'duplicates' | 'timeline'

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(n)
}

function formatCurrencyRounded(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}

function formatDate(s: string): string {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function confidenceBadge(c: DetectedSubscription['confidence']) {
  if (c === 'HIGH') return 'bg-emerald-100 text-emerald-800'
  if (c === 'MEDIUM') return 'bg-amber-100 text-amber-800'
  return 'bg-gray-100 text-gray-600'
}

function frequencyLabel(f: DetectedSubscription['frequency'] | string): string {
  const map: Record<string, string> = {
    weekly: 'Weekly',
    fortnightly: 'Fortnightly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    annual: 'Annual',
  }
  return map[f] || f
}

function isDatePast(dateStr: string): boolean {
  return new Date(dateStr) < new Date()
}

function getWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'Overdue'
  if (diffDays <= 7) return 'This week'
  if (diffDays <= 14) return 'Next week'
  if (diffDays <= 21) return 'In 2 weeks'
  return 'In 3–4 weeks'
}

export function SubscriptionsClient({ subscriptions, duplicates, timeline, accounts }: Props) {
  const [tab, setTab] = useState<Tab>('active')
  const [dismissedDuplicates, setDismissedDuplicates] = useState<Set<string>>(new Set())
  const [confirmedMerchants, setConfirmedMerchants] = useState<Set<string>>(new Set())
  const [dismissedMerchants, setDismissedMerchants] = useState<Set<string>>(new Set())

  async function handleConfirmSub(merchant: string) {
    setConfirmedMerchants(prev => { const n = new Set(prev); n.add(merchant); return n })
    await fetch('/api/mappings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant, classification: 'Subscription' }),
    }).catch(() => {})
  }

  async function handleDismissSub(merchant: string) {
    setDismissedMerchants(prev => { const n = new Set(prev); n.add(merchant); return n })
    await fetch('/api/mappings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant, classification: 'Not a subscription' }),
    }).catch(() => {})
  }

  const active = subscriptions.filter(s => !s.is_lapsed && !dismissedMerchants.has(s.merchant))
  const lapsed = subscriptions.filter(s => s.is_lapsed && !dismissedMerchants.has(s.merchant))
  const displayed = (tab === 'active' ? active : tab === 'lapsed' ? lapsed : subscriptions.filter(s => !dismissedMerchants.has(s.merchant)))

  const activeAnnual = active.reduce((s, sub) => s + sub.annual_estimate, 0)
  const totalAnnual = subscriptions.reduce((s, sub) => s + sub.annual_estimate, 0)

  const visibleDuplicates = duplicates.filter(d => !dismissedDuplicates.has(d.merchant))
  const totalMonthlyWaste = visibleDuplicates.reduce((s, d) => s + d.monthly_waste, 0)

  // Group timeline by week
  const timelineGroups: Record<string, TimelineItem[]> = {}
  for (const item of timeline) {
    const label = getWeekLabel(item.expected_date)
    if (!timelineGroups[label]) timelineGroups[label] = []
    timelineGroups[label].push(item)
  }
  const weekOrder = ['Overdue', 'This week', 'Next week', 'In 2 weeks', 'In 3–4 weeks']
  const sortedGroups = weekOrder.filter(w => timelineGroups[w])

  const next7Total = timeline
    .filter(item => {
      const d = new Date(item.expected_date + 'T00:00:00')
      const in7 = new Date()
      in7.setDate(in7.getDate() + 7)
      return d <= in7
    })
    .reduce((s, item) => s + item.amount, 0)

  const next30Total = timeline.reduce((s, item) => s + item.amount, 0)

  async function handleDismissDuplicate(merchant: string) {
    setDismissedDuplicates(prev => new Set(Array.from(prev).concat(merchant)))
    // Optionally call API to mark as not a duplicate
    await fetch('/api/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant, classification: 'Ignore' }),
    }).catch(() => {})
  }

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500">Active subscriptions</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{active.length}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500">Annual cost (active)</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{formatCurrencyRounded(activeAnnual)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500">Monthly equivalent</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{formatCurrencyRounded(activeAnnual / 12)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-sm text-gray-500">Lapsed / cancelled</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{lapsed.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit overflow-x-auto">
        {(['active', 'lapsed', 'all', 'duplicates', 'timeline'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'active'
              ? `Active (${active.length})`
              : t === 'lapsed'
              ? `Lapsed (${lapsed.length})`
              : t === 'all'
              ? `All (${subscriptions.length})`
              : t === 'duplicates'
              ? `Duplicates${visibleDuplicates.length > 0 ? ` (${visibleDuplicates.length})` : ''}`
              : 'Timeline'}
          </button>
        ))}
      </div>

      {/* Active / Lapsed / All tabs */}
      {(tab === 'active' || tab === 'lapsed' || tab === 'all') && (
        <>
          {displayed.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
              <CalendarIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                {subscriptions.length === 0
                  ? 'No recurring charges detected yet. Import at least 2+ months of transactions to enable subscription detection.'
                  : tab === 'active' ? 'No active subscriptions detected.' : 'No lapsed subscriptions.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayed.map(sub => (
                <div
                  key={sub.merchant}
                  className={`bg-white border rounded-xl p-4 flex items-start gap-4 ${
                    sub.is_lapsed ? 'border-amber-200 bg-amber-50' : 'border-gray-200'
                  }`}
                >
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                    sub.is_lapsed ? 'bg-amber-100' : 'bg-emerald-100'
                  }`}>
                    {sub.is_lapsed
                      ? <ExclamationTriangleIcon className="h-5 w-5 text-amber-600" />
                      : <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <div className="font-semibold text-gray-900">{sub.merchant}</div>
                        <div className="text-sm text-gray-500 mt-0.5">
                          {accounts.find(a => a.id === sub.account_id)?.display_name || 'Unknown'} · {frequencyLabel(sub.frequency)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-gray-900">{formatCurrency(sub.amount)}</div>
                        <div className="text-xs text-gray-400">{formatCurrencyRounded(sub.annual_estimate)}/yr</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mt-3 flex-wrap text-xs text-gray-500">
                      <span>
                        <span className="text-gray-400">Last:</span> {formatDate(sub.last_charged)}
                      </span>
                      <span className={isDatePast(sub.next_expected) && !sub.is_lapsed ? 'text-amber-600 font-medium' : ''}>
                        <span className="text-gray-400">Next:</span> {formatDate(sub.next_expected)}
                        {isDatePast(sub.next_expected) && !sub.is_lapsed && ' (overdue)'}
                      </span>
                      <span>
                        <span className="text-gray-400">Seen:</span> {sub.occurrences} times
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${confidenceBadge(sub.confidence)}`}>
                        {sub.confidence}
                      </span>
                      {sub.is_lapsed && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          Possibly cancelled
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                      {confirmedMerchants.has(sub.merchant) ? (
                        <span className="text-xs text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                          ✓ Confirmed
                        </span>
                      ) : (
                        <button
                          onClick={() => handleConfirmSub(sub.merchant)}
                          className="text-xs bg-emerald-700 text-white rounded-full px-3 py-1 hover:bg-emerald-800 transition-colors"
                        >
                          Confirm
                        </button>
                      )}
                      <button
                        onClick={() => handleDismissSub(sub.merchant)}
                        className="text-xs text-gray-500 border border-gray-200 rounded-full px-3 py-1 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {subscriptions.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500">
              <p>
                <span className="font-medium text-gray-700">How this works:</span> Recurring charges are detected by finding merchants
                with consistent payment amounts (CV &lt; 15%) and regular intervals. Confidence increases with more occurrences.
                {totalAnnual !== activeAnnual && (
                  <> Including lapsed subscriptions, the total detected annual spend is {formatCurrencyRounded(totalAnnual)}.</>
                )}
              </p>
            </div>
          )}
        </>
      )}

      {/* Duplicates tab */}
      {tab === 'duplicates' && (
        <div className="space-y-4">
          {visibleDuplicates.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-800">
                Possible duplicate subscriptions detected
              </p>
              <p className="text-sm text-amber-700 mt-1">
                These merchants appear on multiple accounts. Total monthly waste: <strong>{formatCurrencyRounded(totalMonthlyWaste)}/mo</strong>
              </p>
            </div>
          )}

          {visibleDuplicates.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
              <CheckCircleIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No duplicate subscriptions detected.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleDuplicates.map(dup => (
                <div key={dup.merchant} className="bg-white border border-amber-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 mb-2">{dup.merchant}</div>
                      <div className="space-y-1.5">
                        {dup.accounts.map(acc => (
                          <div key={acc.account_id} className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">{accounts.find(a => a.id === acc.account_id)?.display_name || 'Unknown'}</span>
                            <div className="text-right">
                              <span className="font-medium text-gray-900">{formatCurrency(acc.amount)}</span>
                              <span className="text-xs text-gray-400 ml-2">last {formatDate(acc.last_charged)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 pt-2 border-t border-amber-100 flex items-center justify-between">
                        <span className="text-sm text-amber-700 font-medium">
                          Monthly waste: {formatCurrencyRounded(dup.monthly_waste)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => handleDismissDuplicate(dup.merchant)}
                      className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
                    >
                      Not a duplicate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Timeline tab */}
      {tab === 'timeline' && (
        <div className="space-y-4">
          {/* Totals */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm text-gray-500">Due next 7 days</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{formatCurrencyRounded(next7Total)}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-sm text-gray-500">Due next 30 days</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{formatCurrencyRounded(next30Total)}</div>
            </div>
          </div>

          {timeline.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
              <CalendarIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No subscriptions due in the next 30 days.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedGroups.map(week => (
                <div key={week}>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{week}</h3>
                  <div className="space-y-2">
                    {timelineGroups[week].map((item, i) => (
                      <div
                        key={`${item.merchant}-${i}`}
                        className={`bg-white border rounded-xl p-3 flex items-center justify-between ${
                          item.is_overdue ? 'border-red-200 bg-red-50' : 'border-gray-200'
                        }`}
                      >
                        <div>
                          <span className="text-sm font-medium text-gray-900">{item.merchant}</span>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {accounts.find(a => a.id === item.account_id)?.display_name || 'Unknown'} · {frequencyLabel(item.frequency)} · {formatDate(item.expected_date)}
                            {item.is_overdue && (
                              <span className="ml-2 text-red-600 font-medium">overdue</span>
                            )}
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 ml-4">{formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
