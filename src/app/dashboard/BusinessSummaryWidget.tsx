'use client'

import { useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'

const aud = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)

interface Props {
  balance: number
  revenue: number
  outgoings: number
  accountCount: number
}

export function BusinessSummaryWidget({ balance, revenue, outgoings, accountCount }: Props) {
  const [open, setOpen] = useState(false)
  const net = revenue - outgoings

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden md:col-span-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-900">Business</span>
          <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">
            {accountCount} account{accountCount !== 1 ? 's' : ''}
          </span>
          {!open && (
            <span className="text-sm text-gray-500 hidden sm:inline">
              Balance {aud(balance)} · This month {net >= 0 ? '+' : ''}{aud(net)}
            </span>
          )}
        </div>
        {open ? <ChevronUpIcon className="h-4 w-4 text-gray-400" /> : <ChevronDownIcon className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-4">
          <div className="flex gap-6 flex-wrap">
            <div>
              <span className="text-xs text-gray-400 block">Balance</span>
              <span className={`text-xl font-bold ${balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{aud(balance)}</span>
            </div>
            <div>
              <span className="text-xs text-gray-400 block">Revenue this month</span>
              <span className="text-xl font-bold text-emerald-700">{aud(revenue)}</span>
            </div>
            <div>
              <span className="text-xs text-gray-400 block">Outgoings this month</span>
              <span className="text-xl font-bold text-gray-900">{aud(outgoings)}</span>
            </div>
            <div>
              <span className="text-xs text-gray-400 block">Net this month</span>
              <span className={`text-xl font-bold ${net >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {net >= 0 ? '+' : ''}{aud(net)}
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Business figures are separate from your household budget. Tag accounts as &ldquo;Business&rdquo; in{' '}
            <a href="/settings/accounts" className="text-emerald-700 hover:underline">Settings → Bank Accounts</a>.
          </p>
        </div>
      )}
    </div>
  )
}
