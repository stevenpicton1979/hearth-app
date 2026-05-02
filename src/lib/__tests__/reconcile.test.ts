import { describe, it, expect } from 'vitest'
import {
  detectGapMonths,
  compareAccountCounts,
  detectExternalIdDuplicates,
  detectCsvNearDuplicates,
} from '../reconcile'

// ─── detectGapMonths ──────────────────────────────────────────────────────────

// Helpers — generate dates relative to today so they stay within the 12-month window
function monthAgo(n: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)  // 'YYYY-MM-DD'
}
function monthLabel(n: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 7)   // 'YYYY-MM'
}

describe('detectGapMonths', () => {
  it('returns empty array for single transaction (no range)', () => {
    expect(detectGapMonths([monthAgo(1)])).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(detectGapMonths([])).toEqual([])
  })

  it('returns empty array when all months are covered', () => {
    const dates = [
      monthAgo(3), monthAgo(3),
      monthAgo(2), monthAgo(2),
      monthAgo(1), monthAgo(1),
    ]
    expect(detectGapMonths(dates)).toEqual([])
  })

  it('detects a gap month in the middle', () => {
    // m-2 present, m-1 missing, m-0 present
    const dates = [monthAgo(2), monthAgo(0)]
    expect(detectGapMonths(dates)).toEqual([monthLabel(1)])
  })

  it('detects multiple gap months in the middle', () => {
    // m-3 present, m-2 and m-1 missing, m-0 present
    const dates = [monthAgo(3), monthAgo(0)]
    expect(detectGapMonths(dates)).toEqual([monthLabel(2), monthLabel(1)])
  })

  it('does not flag the start or end month as a gap', () => {
    const dates = [monthAgo(2), monthAgo(0)]
    const gaps = detectGapMonths(dates)
    expect(gaps).not.toContain(monthLabel(2))
    expect(gaps).not.toContain(monthLabel(0))
    expect(gaps).toContain(monthLabel(1))
  })

  it('handles a gap spanning a year boundary', () => {
    // Use 6 months ago → 3 months ago with months 5 and 4 missing.
    // This will cross a year boundary when run in Jan–Jun.
    const dates = [monthAgo(6), monthAgo(3)]
    const gaps = detectGapMonths(dates)
    expect(gaps).toEqual([monthLabel(5), monthLabel(4)])
  })

  it('returns empty array when dates span only two adjacent months', () => {
    const dates = [monthAgo(1), monthAgo(0)]
    expect(detectGapMonths(dates)).toEqual([])
  })

  it('works with unsorted dates', () => {
    const dates = [monthAgo(0), monthAgo(2)]  // reversed order
    expect(detectGapMonths(dates)).toEqual([monthLabel(1)])
  })

  it('ignores gaps older than 12 months', () => {
    // A gap at 13 months ago should not be reported
    const dates = [monthAgo(14), monthAgo(0)]
    const gaps = detectGapMonths(dates)
    expect(gaps).not.toContain(monthLabel(13))
  })
})

// ─── compareAccountCounts ─────────────────────────────────────────────────────

describe('compareAccountCounts', () => {
  it('returns match=true and delta=0 when counts are equal', () => {
    expect(compareAccountCounts(100, 100)).toEqual({ match: true, delta: 0 })
  })

  it('returns match=false and negative delta when DB has fewer than Xero', () => {
    const result = compareAccountCounts(100, 80)
    expect(result.match).toBe(false)
    expect(result.delta).toBe(-20)
  })

  it('returns match=false and positive delta when DB has more than Xero', () => {
    const result = compareAccountCounts(100, 110)
    expect(result.match).toBe(false)
    expect(result.delta).toBe(10)
  })

  it('handles zero counts', () => {
    expect(compareAccountCounts(0, 0)).toEqual({ match: true, delta: 0 })
  })
})

// ─── detectExternalIdDuplicates ───────────────────────────────────────────────

describe('detectExternalIdDuplicates', () => {
  it('returns empty array for clean list', () => {
    const rows = [
      { external_id: 'abc' },
      { external_id: 'def' },
      { external_id: 'ghi' },
    ]
    expect(detectExternalIdDuplicates(rows)).toEqual([])
  })

  it('detects a single duplicate', () => {
    const rows = [
      { external_id: 'abc' },
      { external_id: 'def' },
      { external_id: 'abc' },
    ]
    expect(detectExternalIdDuplicates(rows)).toEqual(['abc'])
  })

  it('detects multiple duplicates', () => {
    const rows = [
      { external_id: 'abc' },
      { external_id: 'def' },
      { external_id: 'abc' },
      { external_id: 'def' },
      { external_id: 'ghi' },
    ]
    const dupes = detectExternalIdDuplicates(rows)
    expect(dupes).toHaveLength(2)
    expect(dupes).toContain('abc')
    expect(dupes).toContain('def')
  })

  it('returns empty array for empty input', () => {
    expect(detectExternalIdDuplicates([])).toEqual([])
  })

  it('an id appearing three times is reported once (not twice)', () => {
    const rows = [
      { external_id: 'abc' },
      { external_id: 'abc' },
      { external_id: 'abc' },
    ]
    expect(detectExternalIdDuplicates(rows)).toEqual(['abc'])
  })
})

// ─── detectCsvNearDuplicates ──────────────────────────────────────────────────

describe('detectCsvNearDuplicates', () => {
  it('returns empty array for clean list', () => {
    const rows = [
      { merchant: 'WOOLWORTHS', amount: 50.00, date: '2024-01-10' },
      { merchant: 'WOOLWORTHS', amount: 75.00, date: '2024-01-10' },  // same merchant+date, different amount
      { merchant: 'COLES', amount: 50.00, date: '2024-01-10' },       // same merchant+amount, different merchant
    ]
    expect(detectCsvNearDuplicates(rows)).toEqual([])
  })

  it('detects a near-duplicate pair', () => {
    const rows = [
      { merchant: 'WOOLWORTHS', amount: 50.00, date: '2024-01-10' },
      { merchant: 'WOOLWORTHS', amount: 50.00, date: '2024-01-10' },
    ]
    const result = detectCsvNearDuplicates(rows)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ merchant: 'WOOLWORTHS', amount: 50.00, date: '2024-01-10', count: 2 })
  })

  it('detects a three-way collision', () => {
    const rows = [
      { merchant: 'NETFLIX', amount: 22.99, date: '2024-02-01' },
      { merchant: 'NETFLIX', amount: 22.99, date: '2024-02-01' },
      { merchant: 'NETFLIX', amount: 22.99, date: '2024-02-01' },
    ]
    const result = detectCsvNearDuplicates(rows)
    expect(result).toHaveLength(1)
    expect(result[0].count).toBe(3)
  })

  it('reports multiple duplicate groups independently', () => {
    const rows = [
      { merchant: 'WOOLWORTHS', amount: 50.00, date: '2024-01-10' },
      { merchant: 'WOOLWORTHS', amount: 50.00, date: '2024-01-10' },
      { merchant: 'COLES', amount: 30.00, date: '2024-01-11' },
      { merchant: 'COLES', amount: 30.00, date: '2024-01-11' },
    ]
    expect(detectCsvNearDuplicates(rows)).toHaveLength(2)
  })

  it('returns empty array for empty input', () => {
    expect(detectCsvNearDuplicates([])).toEqual([])
  })
})
