'use client'

import { useState } from 'react'

interface ReviewTransaction {
  id: string
  date: string
  amount: number
  merchant: string
  description: string
  raw_description?: string | null
  accounts?: { display_name: string } | null
}

function formatAmount(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
}

function formatDate(s: string): string {
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function NeedsReviewPanel({ transactions }: { transactions: ReviewTransaction[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  async function dismiss(id: string) {
    const res = await fetch(`/api/transactions/${id}/review`, { method: 'DELETE' })
    if (res.ok) setDismissed(prev => new Set([...Array.from(prev), id]))
  }

  const visible = transactions.filter(t => !dismissed.has(t.id))

  if (visible.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm">No transactions need review.</p>
        <p className="text-xs text-gray-400 mt-2">
          Unmatched Xero transfers appear here when their destination account suffix
          isn&apos;t entered in Settings → Accounts.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        These Xero transfers contain a destination account suffix that doesn&apos;t match any account in Hearth.
        Enter the suffix in <a href="/settings/accounts" className="underline font-medium">Settings → Accounts</a>,
        then run a Full Re-sync from <a href="/settings/xero" className="underline font-medium">Settings → Xero</a> to resolve them.
        Or dismiss individual rows if they are external payments you don&apos;t need to track.
      </p>

      {visible.map(tx => (
        <div key={tx.id} className="bg-white border border-amber-200 rounded-xl p-4 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900">{tx.merchant}</span>
              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                Unmatched Transfer
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {formatDate(tx.date)} · {tx.accounts?.display_name ?? '—'}
            </p>
            {tx.raw_description && (
              <p className="text-xs text-gray-400 mt-1 font-mono truncate">{tx.raw_description}</p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className={`font-medium tabular-nums ${tx.amount < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
              {formatAmount(tx.amount)}
            </span>
            <button
              onClick={() => dismiss(tx.id)}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
