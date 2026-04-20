'use client'

import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { PlusIcon, PencilIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'
import { Asset, Liability, NetWorthSnapshot } from '@/lib/types'

interface AccountRow {
  id: string
  display_name: string
  institution: string | null
  current_balance: number | null
  last_synced_at: string | null
}

interface Props {
  assets: Asset[]
  liabilities: Liability[]
  accounts: AccountRow[]
  snapshots: NetWorthSnapshot[]
  bankBalance: number
  totalAssets: number
  totalLiabilities: number
  netWorth: number
}

const aud = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)

const audFull = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(n)

function formatDate(s: string): string {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

const ASSET_TYPE_LABELS: Record<Asset['asset_type'], string> = {
  property: 'Property',
  super: 'Superannuation',
  shares: 'Shares & Investments',
  cash: 'Cash',
  other: 'Other',
}

const LIABILITY_TYPE_LABELS: Record<Liability['liability_type'], string> = {
  mortgage: 'Mortgage',
  personal_loan: 'Personal Loan',
  car_loan: 'Car Loan',
  credit_card: 'Credit Card',
  bnpl: 'Buy Now Pay Later',
  other: 'Other',
}

interface AddAssetForm {
  name: string
  value: string
  as_at: string
  notes: string
}

interface AddLiabilityForm {
  name: string
  liability_type: Liability['liability_type']
  balance: string
  as_at: string
}

interface UpdateValueForm {
  value: string
  as_at: string
}

export function NetWorthClient({
  assets: initialAssets,
  liabilities: initialLiabilities,
  accounts,
  snapshots,
  bankBalance,
}: Props) {
  const [assets, setAssets] = useState<Asset[]>(initialAssets)
  const [liabilities, setLiabilities] = useState<Liability[]>(initialLiabilities)
  const [localSnapshots, setLocalSnapshots] = useState<NetWorthSnapshot[]>(snapshots)

  const [showAddProperty, setShowAddProperty] = useState(false)
  const [showAddSuper, setShowAddSuper] = useState(false)
  const [showAddLiability, setShowAddLiability] = useState(false)
  const [showAssets, setShowAssets] = useState(true)
  const [showLiabilities, setShowLiabilities] = useState(true)

  const [editingAssetId, setEditingAssetId] = useState<string | null>(null)
  const [editingLiabilityId, setEditingLiabilityId] = useState<string | null>(null)
  const [updateForm, setUpdateForm] = useState<UpdateValueForm>({ value: '', as_at: new Date().toISOString().slice(0, 10) })

  const [propertyForm, setPropertyForm] = useState<AddAssetForm>({
    name: '', value: '', as_at: new Date().toISOString().slice(0, 10), notes: '',
  })
  const [superForm, setSuperForm] = useState<AddAssetForm>({
    name: '', value: '', as_at: new Date().toISOString().slice(0, 10), notes: '',
  })
  const [liabilityForm, setLiabilityForm] = useState<AddLiabilityForm>({
    name: '', liability_type: 'mortgage', balance: '', as_at: new Date().toISOString().slice(0, 10),
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [recordingSnapshot, setRecordingSnapshot] = useState(false)

  // Recompute totals from local state
  const manualAssetsTotal = assets.reduce((s, a) => s + a.value, 0)
  const totalAssets = manualAssetsTotal + bankBalance
  const totalLiabilities = liabilities.reduce((s, l) => s + l.balance, 0)
  const netWorth = totalAssets - totalLiabilities

  // Chart data
  const chartData = localSnapshots.map(s => ({
    date: new Date(s.recorded_at).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }),
    netWorth: s.net_worth,
  }))

  async function handleRecordSnapshot() {
    setRecordingSnapshot(true)
    try {
      const res = await fetch('/api/snapshots', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLocalSnapshots(prev => [...prev, data.snapshot].slice(-24))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record snapshot')
    } finally {
      setRecordingSnapshot(false)
    }
  }

  async function handleAddAsset(type: Asset['asset_type'], form: AddAssetForm, reset: () => void) {
    if (!form.name || !form.value) return setError('Name and value are required')
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          asset_type: type,
          value: parseFloat(form.value),
          notes: form.notes || null,
          as_at: form.as_at,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAssets(prev => [...prev, data.asset])
      reset()
      if (type === 'property') setShowAddProperty(false)
      if (type === 'super') setShowAddSuper(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add asset')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddLiability() {
    if (!liabilityForm.name || !liabilityForm.balance) return setError('Name and balance are required')
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/liabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: liabilityForm.name,
          liability_type: liabilityForm.liability_type,
          balance: parseFloat(liabilityForm.balance),
          as_at: liabilityForm.as_at,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLiabilities(prev => [...prev, data.liability])
      setLiabilityForm({ name: '', liability_type: 'mortgage', balance: '', as_at: new Date().toISOString().slice(0, 10) })
      setShowAddLiability(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add liability')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateAsset(id: string) {
    if (!updateForm.value) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/assets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, value: parseFloat(updateForm.value), as_at: updateForm.as_at }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAssets(prev => prev.map(a => (a.id === id ? data.asset : a)))
      setEditingAssetId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update asset')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateLiability(id: string) {
    if (!updateForm.value) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/liabilities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, balance: parseFloat(updateForm.value), as_at: updateForm.as_at }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLiabilities(prev => prev.map(l => (l.id === id ? data.liability : l)))
      setEditingLiabilityId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update liability')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteAsset(id: string) {
    if (!confirm('Delete this asset?')) return
    const res = await fetch(`/api/assets?id=${id}`, { method: 'DELETE' })
    if (res.ok) setAssets(prev => prev.filter(a => a.id !== id))
  }

  async function handleDeleteLiability(id: string) {
    if (!confirm('Delete this liability?')) return
    const res = await fetch(`/api/liabilities?id=${id}`, { method: 'DELETE' })
    if (res.ok) setLiabilities(prev => prev.filter(l => l.id !== id))
  }

  // Group assets by type
  const assetsByType = (Object.keys(ASSET_TYPE_LABELS) as Asset['asset_type'][]).map(type => ({
    type,
    label: ASSET_TYPE_LABELS[type],
    items: assets.filter(a => a.asset_type === type),
  })).filter(g => g.items.length > 0)

  // Group liabilities by type
  const liabsByType = (Object.keys(LIABILITY_TYPE_LABELS) as Liability['liability_type'][]).map(type => ({
    type,
    label: LIABILITY_TYPE_LABELS[type],
    items: liabilities.filter(l => l.liability_type === type),
  })).filter(g => g.items.length > 0)

  const netWorthPositive = netWorth >= 0

  return (
    <div className="space-y-6">
      {/* Summary header */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500 mb-1">Net Worth</p>
            <p className={`text-4xl font-bold ${netWorthPositive ? 'text-emerald-700' : 'text-red-600'}`}>
              {aud(netWorth)}
            </p>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Total Assets</p>
              <p className="text-xl font-semibold text-gray-900 mt-0.5">{aud(totalAssets)}</p>
            </div>
            <div className="w-px bg-gray-200" />
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Total Liabilities</p>
              <p className="text-xl font-semibold text-red-600 mt-0.5">{aud(totalLiabilities)}</p>
            </div>
          </div>
          <button
            onClick={handleRecordSnapshot}
            disabled={recordingSnapshot}
            className="flex items-center gap-2 bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 transition-colors"
          >
            {recordingSnapshot ? 'Recording...' : 'Record snapshot'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Net worth chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Net Worth Over Time</h2>
        {chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-gray-400 text-sm">No snapshots recorded yet.</p>
            <p className="text-gray-400 text-sm mt-1">Click &quot;Record snapshot&quot; to track your net worth over time.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={v =>
                  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', notation: 'compact', maximumFractionDigits: 0 }).format(v)
                }
              />
              <Tooltip
                formatter={(value) => [audFull(Number(value ?? 0)), 'Net Worth']}
                labelStyle={{ color: '#374151' }}
              />
              <Line
                type="monotone"
                dataKey="netWorth"
                stroke="#047857"
                strokeWidth={2}
                dot={{ r: 4, fill: '#047857' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Assets section */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowAssets(v => !v)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-900">Assets</h2>
            <span className="text-sm text-gray-500">({aud(totalAssets)})</span>
          </div>
          {showAssets ? <ChevronUpIcon className="h-5 w-5 text-gray-400" /> : <ChevronDownIcon className="h-5 w-5 text-gray-400" />}
        </button>

        {showAssets && (
          <div className="border-t border-gray-100">
            {/* Bank accounts */}
            {accounts.length > 0 && (
              <div className="px-6 py-4">
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Bank Accounts</h3>
                <div className="space-y-2">
                  {accounts.map(acc => (
                    <div key={acc.id} className="flex items-center justify-between py-1">
                      <div>
                        <span className="text-sm font-medium text-gray-800">{acc.display_name}</span>
                        {acc.institution && <span className="text-xs text-gray-400 ml-2">{acc.institution}</span>}
                        {acc.last_synced_at && (
                          <span className="text-xs text-gray-400 ml-2">
                            synced {formatDate(acc.last_synced_at.slice(0, 10))}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{audFull(acc.current_balance || 0)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-500">Total bank balance</span>
                  <span className="text-sm font-semibold text-gray-900">{aud(bankBalance)}</span>
                </div>
              </div>
            )}

            {/* Manual assets grouped by type */}
            {assetsByType.map(group => (
              <div key={group.type} className="px-6 py-4 border-t border-gray-100">
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">{group.label}</h3>
                <div className="space-y-2">
                  {group.items.map(asset => (
                    <div key={asset.id}>
                      <div className="flex items-center justify-between py-1">
                        <div>
                          <span className="text-sm font-medium text-gray-800">{asset.name}</span>
                          <span className="text-xs text-gray-400 ml-2">as at {formatDate(asset.as_at)}</span>
                          {asset.asset_type === 'super' && daysSince(asset.as_at) > 90 && (
                            <span className="ml-2 text-xs text-amber-600 font-medium">
                              last updated {daysSince(asset.as_at)} days ago
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{audFull(asset.value)}</span>
                          <button
                            onClick={() => {
                              setEditingAssetId(asset.id)
                              setUpdateForm({ value: String(asset.value), as_at: new Date().toISOString().slice(0, 10) })
                            }}
                            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Update value"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteAsset(asset.id)}
                            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {editingAssetId === asset.id && (
                        <div className="mt-2 ml-4 p-3 bg-gray-50 rounded-lg border border-gray-200 flex gap-2 flex-wrap items-end">
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">New value</label>
                            <input
                              type="number"
                              min="0"
                              step="1000"
                              value={updateForm.value}
                              onChange={e => setUpdateForm(f => ({ ...f, value: e.target.value }))}
                              className="text-sm border border-gray-200 rounded px-2 py-1.5 w-36 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">As at</label>
                            <input
                              type="date"
                              value={updateForm.as_at}
                              onChange={e => setUpdateForm(f => ({ ...f, as_at: e.target.value }))}
                              className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                          <button
                            onClick={() => handleUpdateAsset(asset.id)}
                            disabled={saving}
                            className="bg-emerald-700 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-emerald-800 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingAssetId(null)}
                            className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Add property form */}
            {showAddProperty && (
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Add Property</h3>
                <div className="flex gap-3 flex-wrap items-end">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Address / Name</label>
                    <input
                      type="text"
                      placeholder="e.g. 123 Main St"
                      value={propertyForm.name}
                      onChange={e => setPropertyForm(f => ({ ...f, name: e.target.value }))}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-48 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Estimated value</label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      placeholder="750000"
                      value={propertyForm.value}
                      onChange={e => setPropertyForm(f => ({ ...f, value: e.target.value }))}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-36 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">As at</label>
                    <input
                      type="date"
                      value={propertyForm.as_at}
                      onChange={e => setPropertyForm(f => ({ ...f, as_at: e.target.value }))}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    onClick={() =>
                      handleAddAsset('property', propertyForm, () =>
                        setPropertyForm({ name: '', value: '', as_at: new Date().toISOString().slice(0, 10), notes: '' })
                      )
                    }
                    disabled={saving}
                    className="bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-800 disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowAddProperty(false)}
                    className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Add super form */}
            {showAddSuper && (
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Add Superannuation</h3>
                <div className="flex gap-3 flex-wrap items-end">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Fund name</label>
                    <input
                      type="text"
                      placeholder="e.g. Australian Super"
                      value={superForm.name}
                      onChange={e => setSuperForm(f => ({ ...f, name: e.target.value }))}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-48 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Balance</label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="85000"
                      value={superForm.value}
                      onChange={e => setSuperForm(f => ({ ...f, value: e.target.value }))}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-36 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">As at</label>
                    <input
                      type="date"
                      value={superForm.as_at}
                      onChange={e => setSuperForm(f => ({ ...f, as_at: e.target.value }))}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    onClick={() =>
                      handleAddAsset('super', superForm, () =>
                        setSuperForm({ name: '', value: '', as_at: new Date().toISOString().slice(0, 10), notes: '' })
                      )
                    }
                    disabled={saving}
                    className="bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-800 disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowAddSuper(false)}
                    className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Add asset buttons */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-2 flex-wrap">
              {!showAddProperty && (
                <button
                  onClick={() => { setShowAddProperty(true); setShowAddSuper(false) }}
                  className="flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-900 font-medium border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-50 transition-colors"
                >
                  <PlusIcon className="h-4 w-4" /> Add property
                </button>
              )}
              {!showAddSuper && (
                <button
                  onClick={() => { setShowAddSuper(true); setShowAddProperty(false) }}
                  className="flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-900 font-medium border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-50 transition-colors"
                >
                  <PlusIcon className="h-4 w-4" /> Add super
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Liabilities section */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowLiabilities(v => !v)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-900">Liabilities</h2>
            <span className="text-sm text-gray-500">({aud(totalLiabilities)})</span>
          </div>
          {showLiabilities ? <ChevronUpIcon className="h-5 w-5 text-gray-400" /> : <ChevronDownIcon className="h-5 w-5 text-gray-400" />}
        </button>

        {showLiabilities && (
          <div className="border-t border-gray-100">
            {liabsByType.length === 0 && !showAddLiability && (
              <div className="px-6 py-6 text-sm text-gray-400 text-center">No liabilities added yet.</div>
            )}

            {liabsByType.map(group => (
              <div key={group.type} className="px-6 py-4 border-t border-gray-100 first:border-t-0">
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">{group.label}</h3>
                <div className="space-y-2">
                  {group.items.map(liab => (
                    <div key={liab.id}>
                      <div className="flex items-center justify-between py-1">
                        <div>
                          <span className="text-sm font-medium text-gray-800">{liab.name}</span>
                          <span className="text-xs text-gray-400 ml-2">as at {formatDate(liab.as_at)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-red-600">{audFull(liab.balance)}</span>
                          <button
                            onClick={() => {
                              setEditingLiabilityId(liab.id)
                              setUpdateForm({ value: String(liab.balance), as_at: new Date().toISOString().slice(0, 10) })
                            }}
                            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Update balance"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteLiability(liab.id)}
                            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {editingLiabilityId === liab.id && (
                        <div className="mt-2 ml-4 p-3 bg-gray-50 rounded-lg border border-gray-200 flex gap-2 flex-wrap items-end">
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">New balance</label>
                            <input
                              type="number"
                              min="0"
                              step="100"
                              value={updateForm.value}
                              onChange={e => setUpdateForm(f => ({ ...f, value: e.target.value }))}
                              className="text-sm border border-gray-200 rounded px-2 py-1.5 w-36 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">As at</label>
                            <input
                              type="date"
                              value={updateForm.as_at}
                              onChange={e => setUpdateForm(f => ({ ...f, as_at: e.target.value }))}
                              className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                          <button
                            onClick={() => handleUpdateLiability(liab.id)}
                            disabled={saving}
                            className="bg-emerald-700 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-emerald-800 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingLiabilityId(null)}
                            className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Add liability form */}
            {showAddLiability && (
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Add Liability</h3>
                <div className="flex gap-3 flex-wrap items-end">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Home Loan"
                      value={liabilityForm.name}
                      onChange={e => setLiabilityForm(f => ({ ...f, name: e.target.value }))}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-44 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Type</label>
                    <select
                      value={liabilityForm.liability_type}
                      onChange={e => setLiabilityForm(f => ({ ...f, liability_type: e.target.value as Liability['liability_type'] }))}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {(Object.entries(LIABILITY_TYPE_LABELS) as [Liability['liability_type'], string][]).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Balance</label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="450000"
                      value={liabilityForm.balance}
                      onChange={e => setLiabilityForm(f => ({ ...f, balance: e.target.value }))}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-36 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">As at</label>
                    <input
                      type="date"
                      value={liabilityForm.as_at}
                      onChange={e => setLiabilityForm(f => ({ ...f, as_at: e.target.value }))}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    onClick={handleAddLiability}
                    disabled={saving}
                    className="bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-800 disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowAddLiability(false)}
                    className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!showAddLiability && (
              <div className="px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => setShowAddLiability(true)}
                  className="flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-900 font-medium border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-50 transition-colors"
                >
                  <PlusIcon className="h-4 w-4" /> Add liability
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
