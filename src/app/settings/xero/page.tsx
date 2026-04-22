'use client'

import { useEffect, useState } from 'react'
import { SparklesIcon, CheckCircleIcon, XCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline'

interface Connection {
  tenant_name: string | null
  updated_at: string
}

interface SyncResult {
  synced?: number
  skipped?: number
  errors?: string[]
  error?: string
}

export default function XeroSettingsPage() {
  const [connection, setConnection] = useState<Connection | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [showErrors, setShowErrors] = useState(false)

  // Load connection status
  useEffect(() => {
    async function loadStatus() {
      try {
        const res = await fetch('/api/xero/status')
        if (res.ok) {
          const data = await res.json() as { connection: Connection | null }
          setConnection(data.connection)
        }
      } catch (e) {
        console.error('Failed to load Xero status:', e)
      } finally {
        setLoading(false)
      }
    }
    loadStatus()
  }, [])

  const handleConnect = () => {
    window.location.href = '/api/xero/auth'
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/xero/sync', { method: 'POST' })
      const data = await res.json() as SyncResult
      setSyncResult(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setSyncResult({ error: msg })
    } finally {
      setSyncing(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Xero? Existing Xero transactions will remain.')) return
    try {
      const res = await fetch('/api/xero/connection', { method: 'DELETE' })
      if (res.ok) {
        setConnection(null)
        setSyncResult(null)
      }
    } catch (e) {
      console.error('Failed to disconnect:', e)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Xero Integration</h1>
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
          <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-emerald-600" />
          <p className="text-gray-500 text-sm mt-2">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <SparklesIcon className="h-6 w-6 text-emerald-700" />
        <h1 className="text-2xl font-bold text-gray-900">Xero Integration</h1>
      </div>

      {connection ? (
        <>
          <div className="bg-white border border-emerald-200 rounded-xl p-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
                  <p className="font-medium text-gray-900">Connected to Xero</p>
                </div>
                <p className="text-sm text-gray-600">
                  {connection.tenant_name || 'Xero Account'}
                </p>
                {connection.updated_at && (
                  <p className="text-xs text-gray-400 mt-1">
                    Connected on {new Date(connection.updated_at).toLocaleDateString('en-AU')}
                  </p>
                )}
              </div>
              <button
                onClick={handleDisconnect}
                className="text-sm text-red-700 hover:text-red-800 font-medium"
              >
                Disconnect
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <h2 className="font-medium text-gray-900 mb-4">Sync Transactions</h2>
            <p className="text-sm text-gray-600 mb-4">
              Sync authorised bank transactions from Xero into Hearth. Transactions are categorised automatically based on Xero account mappings.
            </p>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {syncing && <ArrowPathIcon className="h-4 w-4 animate-spin" />}
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>

            {syncResult && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                {syncResult.error ? (
                  <div className="flex gap-3">
                    <XCircleIcon className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-800">Sync failed</p>
                      <p className="text-sm text-red-700 mt-1">{syncResult.error}</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
                      <p className="text-sm font-medium text-emerald-800">
                        Sync complete
                      </p>
                    </div>
                    <div className="text-sm text-gray-700">
                      <p>
                        <span className="font-medium">{syncResult.synced || 0}</span> new transaction{(syncResult.synced || 0) !== 1 ? 's' : ''} synced
                      </p>
                      {(syncResult.skipped || 0) > 0 && (
                        <p className="text-gray-600">
                          <span className="font-medium">{syncResult.skipped}</span> duplicate{(syncResult.skipped || 0) !== 1 ? 's' : ''} skipped
                        </p>
                      )}
                      {syncResult.errors && syncResult.errors.length > 0 && (
                        <>
                          <button
                            onClick={() => setShowErrors(!showErrors)}
                            className="text-emerald-700 font-medium text-xs mt-2 hover:underline"
                          >
                            {showErrors ? 'Hide' : 'Show'} {syncResult.errors.length} error{syncResult.errors.length !== 1 ? 's' : ''}
                          </button>
                          {showErrors && (
                            <div className="mt-2 space-y-1 text-xs text-red-700 bg-red-50 p-2 rounded border border-red-200">
                              {syncResult.errors.map((err, i) => (
                                <p key={i}>{err}</p>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-800">
              <strong>How it works:</strong> Xero bank transactions are imported into your &quot;Xero (Business)&quot; account. Transactions are categorised based on their Xero account type. Income transactions are classified as income, expenses as expense items.
            </p>
          </div>
        </>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <SparklesIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600 font-medium mb-2">Connect Xero to Hearth</p>
          <p className="text-sm text-gray-500 mb-6">
            Sync bank transactions directly from your Xero business account. Transactions are automatically categorised based on your Xero account structure.
          </p>
          <button
            onClick={handleConnect}
            className="bg-emerald-700 text-white rounded-lg px-6 py-2 font-medium hover:bg-emerald-800 transition-colors"
          >
            Connect Xero
          </button>
        </div>
      )}
    </div>
  )
}
