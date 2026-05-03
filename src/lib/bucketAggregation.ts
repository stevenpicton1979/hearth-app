import { getOutcomeBucket, formatBucketPath } from './categories'

export interface BucketRow {
  bucket: string[]
  label: string
  totalAmount: number
  count: number
}

export interface BucketTransaction {
  owner: string | null
  is_income: boolean
  is_subscription: boolean
  is_transfer?: boolean
  category: string | null
  amount: number
}

/**
 * Aggregate transactions into outcome buckets.
 * Skips transfers (they have no economic outcome — they're inter-account moves).
 * Returns sorted descending by total amount.
 */
export function aggregateBuckets(txs: BucketTransaction[]): BucketRow[] {
  const groups = new Map<string, { bucket: string[]; totalAmount: number; count: number }>()

  for (const tx of txs) {
    if (tx.is_transfer) continue
    const bucket = getOutcomeBucket({
      owner: tx.owner,
      isIncome: tx.is_income,
      isSubscription: tx.is_subscription,
      category: tx.category,
    })
    const key = bucket.join('|')
    const existing = groups.get(key)
    if (existing) {
      existing.totalAmount += Math.abs(tx.amount)
      existing.count++
    } else {
      groups.set(key, { bucket, totalAmount: Math.abs(tx.amount), count: 1 })
    }
  }

  return Array.from(groups.values())
    .map(g => ({ bucket: g.bucket, label: formatBucketPath(g.bucket), totalAmount: g.totalAmount, count: g.count }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
}

/**
 * Compact realm-level summary for the dashboard widget.
 * Returns one row per (realm, direction) combo, e.g.
 *   { realm: 'Business', direction: 'Income', total: 12345, count: 5 }
 */
export interface RealmSummary {
  realm: string         // 'Business' | 'Personal' | etc.
  direction: 'Income' | 'Expenses'
  total: number
  count: number
}

export function summariseByRealm(rows: BucketRow[]): RealmSummary[] {
  const map = new Map<string, RealmSummary>()
  for (const row of rows) {
    const realm = row.bucket[0] ?? 'Unknown'
    // Walk the bucket path to find Income vs Expenses marker
    const direction: 'Income' | 'Expenses' = row.bucket.includes('Income') ? 'Income' : 'Expenses'
    const key = `${realm}|${direction}`
    const existing = map.get(key)
    if (existing) {
      existing.total += row.totalAmount
      existing.count += row.count
    } else {
      map.set(key, { realm, direction, total: row.totalAmount, count: row.count })
    }
  }
  // Sort: Business Income, Business Expenses, Personal Income, Personal Expenses
  const order = ['Business', 'Personal']
  return Array.from(map.values()).sort((a, b) => {
    const ra = order.indexOf(a.realm)
    const rb = order.indexOf(b.realm)
    if (ra !== rb) return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb)
    return a.direction === 'Income' ? -1 : 1
  })
}
