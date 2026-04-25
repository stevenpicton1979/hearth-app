'use client'

import { useState } from 'react'

const OWNER_OPTIONS = [
  { value: '', label: '— Unset —' },
  { value: 'Steven', label: 'Steven' },
  { value: 'Nicola', label: 'Nicola' },
  { value: 'Joint', label: 'Joint' },
  { value: 'Business', label: 'Business' },
] as const

export default function AccountOwnerSelect({
  accountId,
  initialOwner,
}: {
  accountId: string
  initialOwner: string | null
}) {
  const [owner, setOwner] = useState(initialOwner ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  async function handleChange(next: string) {
    setOwner(next)
    setStatus('saving')
    const res = await fetch(`/api/accounts/${accountId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: next || null }),
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
        value={owner}
        onChange={e => handleChange(e.target.value)}
        disabled={status === 'saving'}
        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
      >
        {OWNER_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {status === 'saving' && <span className="text-xs text-gray-400">Saving…</span>}
      {status === 'saved' && <span className="text-xs text-emerald-600">Saved</span>}
      {status === 'error' && <span className="text-xs text-red-500">Error</span>}
    </div>
  )
}
