'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpTrayIcon, DocumentIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { CheckCircleIcon } from '@heroicons/react/24/solid'

interface ImportResult {
  imported: number
  duplicates: number
  transfers_skipped: number
  auto_categorised: number
  errors: string[]
}

export default function ImportPage() {
  const [files, setFiles] = useState<File[]>([])
  const [accountName, setAccountName] = useState('')
  const [accounts, setAccounts] = useState<{ id: string; display_name: string }[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    fetch('/api/accounts')
      .then(r => r.json())
      .then(data => setAccounts(data.accounts || []))
      .catch(() => {})
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.csv'))
    setFiles(prev => [...prev, ...dropped])
  }, [])

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!files.length) return setError('Please select at least one CSV file')
    if (!accountName && !selectedAccountId) return setError('Please specify an account')

    setIsLoading(true)
    setError('')
    setResult(null)

    const formData = new FormData()
    files.forEach(f => formData.append('files', f))
    formData.append('account_name', accountName)
    formData.append('account_id', selectedAccountId)

    try {
      const res = await fetch('/api/import', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setResult(data)
      setFiles([])
      setAccountName('')
      setSelectedAccountId('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Import Transactions</h1>
        <p className="text-sm text-gray-500 mt-1">Upload CSV files from your bank. Supports CBA, ANZ, and Westpac formats.</p>
      </div>

      {result ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircleIcon className="h-8 w-8 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900">Import Complete</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-emerald-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-emerald-700">{result.imported}</div>
              <div className="text-sm text-emerald-600 mt-1">transactions imported</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-amber-700">{result.auto_categorised}</div>
              <div className="text-sm text-amber-600 mt-1">auto-categorised</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-600">{result.duplicates}</div>
              <div className="text-sm text-gray-500 mt-1">duplicates skipped</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-600">{result.transfers_skipped}</div>
              <div className="text-sm text-gray-500 mt-1">transfers excluded</div>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="text-sm text-red-600 mb-4">{result.errors.length} rows could not be parsed</div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/transactions')}
              className="flex-1 bg-emerald-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-800 transition-colors"
            >
              View Transactions
            </button>
            <button
              onClick={() => setResult(null)}
              className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Import More
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Account selector */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Which account are these from?</h2>
            {accounts.length > 0 && (
              <div className="mb-4">
                <label className="text-sm text-gray-600 mb-2 block">Select existing account</label>
                <select
                  value={selectedAccountId}
                  onChange={e => {
                    setSelectedAccountId(e.target.value)
                    if (e.target.value) setAccountName('')
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">— choose account —</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.display_name}</option>
                  ))}
                </select>
              </div>
            )}
            {!selectedAccountId && (
              <>
                {accounts.length > 0 && <p className="text-xs text-gray-400 mb-3 text-center">or</p>}
                <label className="text-sm text-gray-600 mb-2 block">Create new account</label>
                <input
                  type="text"
                  placeholder="e.g. CBA Everyday Account"
                  value={accountName}
                  onChange={e => setAccountName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </>
            )}
          </div>

          {/* File drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              isDragging ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300'
            }`}
          >
            <ArrowUpTrayIcon className="h-10 w-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">Drop CSV files here</p>
            <p className="text-xs text-gray-400 mt-1">or</p>
            <label className="mt-3 inline-block cursor-pointer">
              <span className="text-sm text-emerald-700 font-medium hover:underline">browse files</span>
              <input
                type="file"
                accept=".csv"
                multiple
                className="hidden"
                onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files || [])])}
              />
            </label>
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3">
                  <DocumentIcon className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                  <span className="text-sm text-gray-700 flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-gray-400">{(f.size / 1024).toFixed(0)} KB</span>
                  <button type="button" onClick={() => removeFile(i)}>
                    <XMarkIcon className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{error}</p>}

          <button
            type="submit"
            disabled={isLoading || !files.length}
            className="w-full bg-emerald-700 text-white rounded-lg py-3 text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading
              ? 'Importing...'
              : `Import ${files.length > 0 ? files.length + ' file' + (files.length > 1 ? 's' : '') : ''}`}
          </button>
        </form>
      )}
    </div>
  )
}
