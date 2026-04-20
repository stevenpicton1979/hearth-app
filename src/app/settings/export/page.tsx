'use client'

import { useState, useEffect } from 'react'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'

interface Account {
  id: string
  display_name: string
}

function getCurrentMonthRange(): { from: string; to: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  }
}

export default function ExportPage() {
  const { from: defaultFrom, to: defaultTo } = getCurrentMonthRange()
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [account, setAccount] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])

  useEffect(() => {
    fetch('/api/accounts')
      .then(r => r.json())
      .then(d => setAccounts(d.accounts || []))
  }, [])

  function handleDownload() {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (account) params.set('account', account)
    window.location.href = `/api/export?${params.toString()}`
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Export & Data</h1>
        <p className="text-sm text-gray-500 mt-1">Download your transactions as a CSV file.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Date range</label>
          <div className="flex gap-3 items-center">
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <span className="text-sm text-gray-400">to</span>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Account (optional)</label>
          <select
            value={account}
            onChange={e => setAccount(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All accounts</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.display_name}</option>
            ))}
          </select>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
          <p className="font-medium text-gray-700 mb-1">Included columns:</p>
          <p className="text-gray-500">Date, Merchant, Description, Account, Amount, Category, Classification, Notes</p>
          <p className="text-gray-500 mt-1">Transfers are excluded. Amounts are negative for expenses.</p>
        </div>

        <button
          onClick={handleDownload}
          className="flex items-center gap-2 bg-emerald-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-emerald-800 transition-colors"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          Download CSV
        </button>
      </div>
    </div>
  )
}
