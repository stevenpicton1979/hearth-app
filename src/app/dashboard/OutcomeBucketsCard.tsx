import Link from 'next/link'
import { ArrowRightIcon } from '@heroicons/react/24/outline'
import type { RealmSummary } from '@/lib/bucketAggregation'

const aud = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)

export function OutcomeBucketsCard({ summary }: { summary: RealmSummary[] }) {
  const realms = Array.from(new Set(summary.map(s => s.realm)))
  const grandIncome = summary.filter(s => s.direction === 'Income').reduce((sum, s) => sum + s.total, 0)
  const grandExpenses = summary.filter(s => s.direction === 'Expenses').reduce((sum, s) => sum + s.total, 0)
  const net = grandIncome - grandExpenses

  if (realms.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Outcome Buckets</h2>
        <p className="text-sm text-gray-400">No transactions yet this month.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900">Outcome Buckets</h2>
        <Link href="/dev/buckets" className="text-xs text-emerald-700 hover:text-emerald-900 flex items-center gap-1">
          Detail <ArrowRightIcon className="h-3 w-3" />
        </Link>
      </div>
      <p className="text-xs text-gray-400 mb-3">Income and expenses grouped by realm — this month</p>

      <div className="space-y-3">
        {realms.map(realm => {
          const inc = summary.find(s => s.realm === realm && s.direction === 'Income')?.total ?? 0
          const exp = summary.find(s => s.realm === realm && s.direction === 'Expenses')?.total ?? 0
          const realmNet = inc - exp
          return (
            <div key={realm} className="border-b border-gray-100 pb-2 last:border-b-0 last:pb-0">
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-medium text-gray-700">{realm}</span>
                <span className={`text-sm font-semibold ${realmNet >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {aud(realmNet)}
                </span>
              </div>
              <div className="flex gap-4 mt-1 text-xs text-gray-500">
                <span>Income <span className="text-emerald-700 font-medium">{aud(inc)}</span></span>
                <span>Expenses <span className="text-gray-700 font-medium">{aud(exp)}</span></span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 pt-3 border-t-2 border-gray-200">
        <div className="flex justify-between items-baseline">
          <span className="text-sm font-bold text-gray-900">Net (all realms)</span>
          <span className={`text-base font-bold ${net >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {aud(net)}
          </span>
        </div>
      </div>
    </div>
  )
}
