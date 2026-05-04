/**
 * Aggregate Director Drawings transactions into a per-period position summary.
 *
 * "Provisional" means the draw has been recorded but not yet confirmed/allocated
 * by the accountant at year-end. Confirmed = is_provisional has been set to false.
 */

export interface PeriodPosition {
  period: string       // 'YYYY-MM'
  drawn: number        // total absolute amount drawn in this period
  provisional: number  // amount still provisional (is_provisional=true)
  confirmed: number    // amount confirmed (is_provisional=false)
}

export interface PositionSummary {
  periods: PeriodPosition[]
  totalDrawn: number
  totalProvisional: number
  totalConfirmed: number
}

export interface PositionTransaction {
  date: string           // 'YYYY-MM-DD'
  amount: number
  category: string | null
  is_provisional: boolean
}

export function aggregatePosition(transactions: PositionTransaction[]): PositionSummary {
  const periodMap = new Map<string, PeriodPosition>()

  for (const tx of transactions) {
    if (tx.category !== 'Director Drawings') continue

    const period = tx.date.slice(0, 7) // 'YYYY-MM'
    if (!periodMap.has(period)) {
      periodMap.set(period, { period, drawn: 0, provisional: 0, confirmed: 0 })
    }
    const p = periodMap.get(period)!
    const abs = Math.abs(tx.amount)
    p.drawn += abs
    if (tx.is_provisional) {
      p.provisional += abs
    } else {
      p.confirmed += abs
    }
  }

  const periods = Array.from(periodMap.values()).sort((a, b) => a.period.localeCompare(b.period))

  return {
    periods,
    totalDrawn: periods.reduce((s, p) => s + p.drawn, 0),
    totalProvisional: periods.reduce((s, p) => s + p.provisional, 0),
    totalConfirmed: periods.reduce((s, p) => s + p.confirmed, 0),
  }
}
