import { describe, it, expect } from 'vitest'
import { aggregatePosition } from '../positionAggregation'
import type { PositionTransaction } from '../positionAggregation'

function tx(date: string, amount: number, is_provisional: boolean): PositionTransaction {
  return { date, amount, category: 'Director Drawings', is_provisional }
}

describe('aggregatePosition', () => {
  it('returns all-zero summary for empty input', () => {
    const result = aggregatePosition([])
    expect(result.totalDrawn).toBe(0)
    expect(result.totalProvisional).toBe(0)
    expect(result.totalConfirmed).toBe(0)
    expect(result.periods).toHaveLength(0)
  })

  it('ignores transactions with categories other than Director Drawings', () => {
    const result = aggregatePosition([
      { date: '2026-03-15', amount: 5000, category: 'Salary', is_provisional: false },
      { date: '2026-03-15', amount: 2000, category: null, is_provisional: false },
    ])
    expect(result.totalDrawn).toBe(0)
  })

  it('counts a single provisional transaction', () => {
    const result = aggregatePosition([tx('2026-03-15', 5000, true)])
    expect(result.totalDrawn).toBe(5000)
    expect(result.totalProvisional).toBe(5000)
    expect(result.totalConfirmed).toBe(0)
    expect(result.periods).toHaveLength(1)
    expect(result.periods[0].period).toBe('2026-03')
    expect(result.periods[0].provisional).toBe(5000)
  })

  it('counts a single confirmed transaction', () => {
    const result = aggregatePosition([tx('2026-04-01', 3000, false)])
    expect(result.totalDrawn).toBe(3000)
    expect(result.totalProvisional).toBe(0)
    expect(result.totalConfirmed).toBe(3000)
  })

  it('uses absolute amount (handles negative amounts from debit side)', () => {
    const result = aggregatePosition([tx('2026-03-15', -5000, true)])
    expect(result.totalDrawn).toBe(5000)
    expect(result.totalProvisional).toBe(5000)
  })

  it('groups multiple transactions into periods and sums correctly', () => {
    const result = aggregatePosition([
      tx('2026-03-10', 5000, true),
      tx('2026-03-25', 3000, false),
      tx('2026-04-10', 4000, true),
    ])
    expect(result.periods).toHaveLength(2)
    expect(result.periods[0].period).toBe('2026-03')
    expect(result.periods[0].drawn).toBe(8000)
    expect(result.periods[0].provisional).toBe(5000)
    expect(result.periods[0].confirmed).toBe(3000)
    expect(result.periods[1].period).toBe('2026-04')
    expect(result.periods[1].drawn).toBe(4000)
    expect(result.totalDrawn).toBe(12000)
    expect(result.totalProvisional).toBe(9000)
    expect(result.totalConfirmed).toBe(3000)
  })

  it('sorts periods chronologically', () => {
    const result = aggregatePosition([
      tx('2026-05-01', 1000, true),
      tx('2026-02-01', 2000, true),
      tx('2026-04-01', 3000, false),
    ])
    expect(result.periods.map(p => p.period)).toEqual(['2026-02', '2026-04', '2026-05'])
  })
})
