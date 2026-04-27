import { describe, it, expect } from 'vitest'
import {
  detectGapMonths,
  compareAccountCounts,
  detectExternalIdDuplicates,
  detectCsvNearDuplicates,
} from '../reconcile'

// ─── detectGapMonths ──────────────────────────────────────────────────────────

describe('detectGapMonths', () => {
  it('returns empty array for single transaction (no range)', () => {
    expect(detectGapMonths(['2024-03-15'])).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(detectGapMonths([])).toEqual([])
  })

  it('returns empty array when all months are covered', () => {
    const dates = [
      '2024-01-10', '2024-01-25',
      '2024-02-05', '2024-02-20',
      '2024-03-01', '2024-03-30',
    ]
    expect(detectGapMonths(dates)).toEqual([])
  })

  it('detects a gap month in the middle', () => {
    const dates = [
      '2024-01-10',
      // no February
      '2024-03-01',
    ]
    expect(detectGapMonths(dates)).toEqual(['2024-02'])
  })

  it('detects multiple gap months in the middle', () => {
    const dates = ['2024-01-01', '2024-04-01']
    expect(detectGapMonths(dates)).toEqual(['2024-02', '2024-03'])
  })

  it('does not flag the start or end month as a gap', () => {
    // min and max months always have at least one transaction by definition
    const dates = ['2024-01-01', '2024-03-01']
    const gaps = detectGapMonths(dates)
    expect(gaps).not.toContain('2024-01')
    expect(gaps).not.toContain('2024-03')
    expect(gaps).toContain('2024-02')
  })

  it('handles a gap spanning a year boundary', () => {
    const dates = ['2023-11-01', '2024-02-01']
    expect(detectGapMonths(dates)).toEqual(['2023-12', '2024-01'])
  })

  it('returns empty array when dates span only two adjacent months', () => {
    const dates = ['2024-01-31', '2024-02-01']
    expect(detectGapMonths(dates)).toEqual([])
  })

  it('works with unsorted dates', () => {
    const dates = ['2024-03-01', '2024-01-15']
    expect(detectGapMonths(dates)).toEqual(['2024-02'])
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
