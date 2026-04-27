/**
 * Pure functions for Xero data reconciliation analysis.
 * All logic is isolated here so it can be tested without hitting the DB or API.
 */

/**
 * Given an array of ISO date strings ('YYYY-MM-DD'), returns the 'YYYY-MM'
 * months that fall within the min–max range but have zero transactions.
 * Returns [] when fewer than 2 dates are provided (no range to check).
 */
export function detectGapMonths(dates: string[]): string[] {
  if (dates.length < 2) return []

  const monthSet = new Set(dates.map(d => d.slice(0, 7)))

  const minDate = dates.reduce((a, b) => (a < b ? a : b))
  const maxDate = dates.reduce((a, b) => (a > b ? a : b))

  let year = parseInt(minDate.slice(0, 4))
  let month = parseInt(minDate.slice(5, 7))
  const endYear = parseInt(maxDate.slice(0, 4))
  const endMonth = parseInt(maxDate.slice(5, 7))

  const gaps: string[] = []

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const ym = `${year}-${String(month).padStart(2, '0')}`
    if (!monthSet.has(ym)) gaps.push(ym)
    month++
    if (month > 12) { month = 1; year++ }
  }

  return gaps
}

export interface CountComparison {
  match: boolean
  delta: number  // dbCount - xeroCount; positive = DB has more, negative = DB has fewer
}

/**
 * Compare the number of Xero API transactions to the DB count for the same account.
 */
export function compareAccountCounts(xeroCount: number, dbCount: number): CountComparison {
  return { match: xeroCount === dbCount, delta: dbCount - xeroCount }
}

/**
 * Returns the external_ids that appear more than once in the provided rows.
 * Any result is a data integrity bug (the upsert key should prevent duplication).
 */
export function detectExternalIdDuplicates(rows: { external_id: string }[]): string[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    counts.set(row.external_id, (counts.get(row.external_id) ?? 0) + 1)
  }
  const dupes: string[] = []
  for (const [id, count] of counts) {
    if (count > 1) dupes.push(id)
  }
  return dupes
}

export interface NearDuplicateGroup {
  merchant: string
  amount: number
  date: string
  count: number
}

/**
 * Finds CSV rows that share (merchant, amount, date) — likely accidental duplicates.
 */
export function detectCsvNearDuplicates(
  rows: { merchant: string; amount: number; date: string }[]
): NearDuplicateGroup[] {
  const groups = new Map<string, NearDuplicateGroup>()
  for (const row of rows) {
    const key = `${row.merchant}|${row.amount}|${row.date}`
    const existing = groups.get(key)
    if (existing) {
      existing.count++
    } else {
      groups.set(key, { merchant: row.merchant, amount: row.amount, date: row.date, count: 1 })
    }
  }
  return Array.from(groups.values()).filter(g => g.count > 1)
}

export interface AccountReconciliation {
  id: string
  name: string
  dbCount: number
  minDate: string | null
  maxDate: string | null
  gapMonths: string[]
}

export interface ReconcileResult {
  accounts: AccountReconciliation[]
  externalIdDuplicates: string[]
  csvNearDuplicates: NearDuplicateGroup[]
}
