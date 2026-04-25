'use client'

import { useState } from 'react'

export default function AccountSuffixInput({
  accountId,
  initialSuffix,
}: {
  accountId: string
  initialSuffix: string | null
}) {
  const [suffix, setSuffix] = useState(initialSuffix ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  async function handleBlur() {
    const trimmed = suffix.trim().toUpperCase()
    if (trimmed === (initialSuffix ?? '').toUpperCase()) return
    setStatus('saving')
    const res = await fetch(`/api/accounts/${accountId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_suffix: trimmed || null }),
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
      <input
        type="text"
        value={suffix}
        onChange={e => setSuffix(e.target.value)}
        onBlur={handleBlur}
        placeholder="e.g. XX5426"
        maxLength={10}
        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 w-28 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-gray-300 font-mono uppercase"
      />
      {status === 'saving' && <span className="text-xs text-gray-400">Saving…</span>}
      {status === 'saved'  && <span className="text-xs text-emerald-600">Saved</span>}
      {status === 'error'  && <span className="text-xs text-red-500">Error</span>}
    </div>
  )
}
