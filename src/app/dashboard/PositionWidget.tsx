import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { aggregatePosition } from '@/lib/positionAggregation'

const aud = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)

function periodLabel(period: string): string {
  const [year, month] = period.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
}

interface Props {
  /** Financial year start month 'YYYY-MM' — filters to FY containing this month. */
  fromPeriod?: string
}

export async function PositionWidget({ fromPeriod }: Props) {
  const supabase = createServerClient()

  const query = supabase
    .from('transactions')
    .select('date, amount, category, is_provisional')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('category', 'Director Drawings')

  if (fromPeriod) {
    query.gte('date', fromPeriod + '-01')
  }

  const { data } = await query

  const summary = aggregatePosition(
    (data ?? []).map(r => ({
      date: r.date as string,
      amount: r.amount as number,
      category: r.category as string,
      is_provisional: (r.is_provisional as boolean) ?? false,
    }))
  )

  if (summary.totalDrawn === 0) return null

  return (
    <div className="bg-white border border-amber-200 rounded-xl p-5 md:col-span-2">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">Director Drawings</h2>
        {summary.totalProvisional > 0 && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            {aud(summary.totalProvisional)} provisional
          </span>
        )}
      </div>

      <div className="flex gap-6 mb-4 text-sm">
        <div>
          <span className="text-xs text-gray-400 block">Total drawn</span>
          <span className="font-semibold text-gray-900">{aud(summary.totalDrawn)}</span>
        </div>
        <div>
          <span className="text-xs text-gray-400 block">Provisional</span>
          <span className="font-semibold text-amber-600">{aud(summary.totalProvisional)}</span>
        </div>
        <div>
          <span className="text-xs text-gray-400 block">Confirmed</span>
          <span className="font-semibold text-emerald-600">{aud(summary.totalConfirmed)}</span>
        </div>
      </div>

      <div className="space-y-2">
        {summary.periods.map(p => (
          <div key={p.period} className="flex items-center justify-between text-sm py-1 border-t border-gray-50">
            <span className="text-gray-600">{periodLabel(p.period)}</span>
            <div className="flex items-center gap-3">
              {p.provisional > 0 && (
                <span className="text-xs text-amber-600">{aud(p.provisional)} prov.</span>
              )}
              <span className="font-medium text-gray-900">{aud(p.drawn)}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Provisional amounts are confirmed by your accountant at year-end allocation.
      </p>
    </div>
  )
}
