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
    { label: 'monthly', days: 30, tolerance: 5 },
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

export function detectSubscriptions(
  transactions: Transaction[],
  accounts: { id: string; display_name: string }[]
): DetectedSubscription[] {
  const accountMap = new Map<string, string>(accounts.map(a => [a.id, a.display_name]))

  // Filter out transfers and group by merchant+account
  const eligible = transactions.filter(t => !t.is_transfer && t.amount < 0)

  // Group by merchant
  const byMerchant: Record<string, Transaction[]> = {}
  for (const t of eligible) {
    if (!byMerchant[t.merchant]) byMerchant[t.merchant] = []
    byMerchant[t.merchant].push(t)
  }

  const results: DetectedSubscription[] = []

  for (const [merchant, txns] of Object.entries(byMerchant)) {
    if (txns.length < 2) continue

    // Sort by date ascending
    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date))

    // Compute inter-transaction intervals in days
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

    // Check interval consistency: std < 0.35 * median
    if (intervalStd > 0.35 * medianInterval) continue

    // Check amount consistency: CV < 0.20
    const amounts = sorted.map(t => Math.abs(t.amount))
    const amtMean = mean(amounts)
    const amtStd = stddev(amounts, amtMean)
    const cv = amtMean > 0 ? amtStd / amtMean : 1
    if (cv >= 0.20) continue

    // Determine confidence
    let confidence: DetectedSubscription['confidence']
    if (sorted.length >= 5) confidence = 'HIGH'
    else if (sorted.length >= 3) confidence = 'MEDIUM'
    else confidence = 'PROBABLE'

    const lastCharged = sorted[sorted.length - 1].date
    const nextExpected = addDays(lastCharged, medianInterval)
    const daysSinceLast = daysSince(lastCharged)
    const isLapsed = daysSinceLast > 1.5 * medianInterval

    // Compute annual estimate
    const annualMultiplier = 365 / freqMatch.bucket
    const annualEstimate = amtMean * annualMultiplier

    // Use the most common account_id for this merchant
    const accountCounts: Record<string, number> = {}
    for (const t of sorted) accountCounts[t.account_id] = (accountCounts[t.account_id] || 0) + 1
    const primaryAccountId = Object.entries(accountCounts).sort((a, b) => b[1] - a[1])[0][0]

    results.push({
      merchant,
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

  // Sort by annual estimate descending
  return results.sort((a, b) => b.annual_estimate - a.annual_estimate)
}
