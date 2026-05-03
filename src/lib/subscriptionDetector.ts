import { Transaction, DetectedSubscription } from './types'

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function stddev(arr: number[], mean: number): number {
  if (arr.length < 2) return 0
  const variance = arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arr.length
  return Math.sqrt(variance)
}

function mean(arr: number[]): number {
  return arr.reduce((sum, v) => sum + v, 0) / arr.length
}

function detectFrequency(medianInterval: number): {
  frequency: DetectedSubscription['frequency']
  bucket: number
} | null {
  const buckets: { label: DetectedSubscription['frequency']; days: number; tolerance: number }[] = [
    { label: 'weekly', days: 7, tolerance: 2 },
    { label: 'fortnightly', days: 14, tolerance: 3 },
    { label: 'monthly', days: 30, tolerance: 8 },
    { label: 'quarterly', days: 91, tolerance: 10 },
    { label: 'annual', days: 365, tolerance: 30 },
  ]
  for (const b of buckets) {
    if (Math.abs(medianInterval - b.days) <= b.tolerance) {
      return { frequency: b.label, bucket: b.days }
    }
  }
  return null
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + Math.round(days))
  return d.toISOString().slice(0, 10)
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

// Categories where transactions are typically one-off purchases, not subscriptions
const EXCLUDED_CATEGORIES = new Set([
  'Shopping',
  'Food & Groceries',
  'Transport',
  'Medical',
  'Pets',
  'Personal Care'
])

export function detectSubscriptions(
  transactions: Transaction[],
  accounts: { id: string; display_name: string }[],
  options?: {
    merchantToSubId?: Map<string, string>
    subNames?: Map<string, string>
  }
): DetectedSubscription[] {
  const merchantToSubId = options?.merchantToSubId ?? new Map<string, string>()
  const subNames = options?.subNames ?? new Map<string, string>()
  const accountMap = new Map<string, string>(accounts.map(a => [a.id, a.display_name]))

  const eligible = transactions.filter(t => !t.is_transfer && t.amount < 0)

  // Group transactions by subscription_id (if linked) or raw merchant string.
  // Track which subscription_id was assigned to each group.
  const byGroup: Record<string, { txns: Transaction[]; merchants: Set<string>; subId: string | null }> = {}
  for (const t of eligible) {
    const subId = merchantToSubId.get(t.merchant) ?? null
    const groupKey = subId ?? t.merchant
    if (!byGroup[groupKey]) byGroup[groupKey] = { txns: [], merchants: new Set(), subId }
    byGroup[groupKey].txns.push(t)
    byGroup[groupKey].merchants.add(t.merchant)
  }

  const results: DetectedSubscription[] = []

  for (const [groupKey, { txns, merchants, subId }] of Object.entries(byGroup)) {
    if (txns.length < 2) continue

    // Check if merchant is in an excluded category (use first transaction's category)
    const merchantCategory = txns[0].category
    if (merchantCategory && EXCLUDED_CATEGORIES.has(merchantCategory)) continue

    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date))

    const intervals: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      const a = new Date(sorted[i - 1].date)
      const b = new Date(sorted[i].date)
      const days = (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)
      intervals.push(days)
    }

    if (intervals.length === 0) continue

    const medianInterval = median(intervals)
    const freqMatch = detectFrequency(medianInterval)
    if (!freqMatch) continue

    const intervalMean = mean(intervals)
    const intervalStd = stddev(intervals, intervalMean)
    if (intervalStd > 0.40 * medianInterval) continue

    const amounts = sorted.map(t => Math.abs(t.amount))
    const amtMean = mean(amounts)
    const amtStd = stddev(amounts, amtMean)
    const cv = amtMean > 0 ? amtStd / amtMean : 1
    if (cv >= 0.25) continue

    let confidence: DetectedSubscription['confidence']
    if (sorted.length >= 5) confidence = 'HIGH'
    else if (sorted.length >= 3) confidence = 'MEDIUM'
    else confidence = 'PROBABLE'

    const lastCharged = sorted[sorted.length - 1].date
    const nextExpected = addDays(lastCharged, medianInterval)
    const isLapsed = daysSince(lastCharged) > 1.5 * medianInterval

    const annualMultiplier = 365 / freqMatch.bucket
    const annualEstimate = amtMean * annualMultiplier

    const accountCounts: Record<string, number> = {}
    for (const t of sorted) accountCounts[t.account_id] = (accountCounts[t.account_id] || 0) + 1
    const primaryAccountId = Object.entries(accountCounts).sort((a, b) => b[1] - a[1])[0][0]

    // Primary merchant: most frequent, falling back to sorted-first for ties
    const merchantCounts: Record<string, number> = {}
    for (const t of sorted) merchantCounts[t.merchant] = (merchantCounts[t.merchant] || 0) + 1
    const primaryMerchant = Object.entries(merchantCounts).sort((a, b) => b[1] - a[1])[0][0]

    // For unlinked groups, groupKey IS the merchant string.
    // For linked groups, groupKey IS the subscription_id (a UUID).
    const merchantsArr = Array.from(merchants).sort()

    results.push({
      subscription_id: subId,
      display_name: subId ? (subNames.get(subId) ?? subId) : groupKey,
      merchant: subId ? primaryMerchant : groupKey,
      merchants: merchantsArr,
      account_id: primaryAccountId,
      account_name: accountMap.get(primaryAccountId) || 'Unknown',
      amount: amtMean,
      frequency: freqMatch.frequency,
      interval_days: Math.round(medianInterval),
      annual_estimate: annualEstimate,
      last_charged: lastCharged,
      next_expected: nextExpected,
      occurrences: sorted.length,
      confidence,
      is_lapsed: isLapsed,
    })
  }

  return results.sort((a, b) => b.annual_estimate - a.annual_estimate)
}
