'use client'

import { useState } from 'react'

const SCOPE_OPTIONS = [
  { value: 'household', label: 'Household', hint: 'Day-to-day personal spending & income' },
  { value: 'business', label: 'Business', hint: 'Business revenue, expenses, and accounts' },
  { value: 'investment', label: 'Investment', hint: 'Shares, super, and investment accounts' },
] as const

type Scope = 'household' | 'business' | 'investment'

export default function AccountScopeSelect({ accountId, initialScope }: { accountId: string; initialScope: Scope }) {
  const [scope, setScope] = useState<Scope>(initialScope)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  async function handleChange(next: Scope) {
    setScope(next)
    setStatus('saving')
    const res = await fetch(`/api/accounts/${accountId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: next }),
    })
    if (res.ok) {
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 1500)
    } else {
      setStatus('error')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={scope}
        onChange={e => handleChange(e.target.value as Scope)}
        disabled={status === 'saving'}
        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
      >
        {SCOPE_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {status === 'saving' && <span className="text-xs text-gray-400">Saving…</span>}
      {status === 'saved' && <span className="text-xs text-emerald-600">Saved</span>}
      {status === 'error' && <span className="text-xs text-red-500">Error</span>}
    </div>
  )
}
