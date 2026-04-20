'use client'

import { useState, useCallback } from 'react'
import { CATEGORIES, CLASSIFICATIONS } from '@/lib/constants'
import { MerchantMapping } from '@/lib/types'
import { MagnifyingGlassIcon, TrashIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { CheckCircleIcon } from '@heroicons/react/24/solid'

interface Props {
  initialMappings: MerchantMapping[]
}

export function MappingsTable({ initialMappings }: Props) {
  const [mappings, setMappings] = useState<MerchantMapping[]>(initialMappings)
  const [search, setSearch] = useState('')
  const [editingMerchant, setEditingMerchant] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<{ category: string; classification: string; notes: string }>({
    category: '', classification: '', notes: '',
  })
  const [isApplying, setIsApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const filtered = mappings.filter(m =>
    m.merchant.toLowerCase().includes(search.toLowerCase())
  )

  const startEdit = (m: MerchantMapping) => {
    setEditingMerchant(m.merchant)
    setEditValues({
      category: m.category || '',
      classification: m.classification || '',
      notes: m.notes || '',
    })
  }

  const cancelEdit = () => {
    setEditingMerchant(null)
  }

  const saveEdit = useCallback(async (merchant: string) => {
    setSaving(true)
    try {
      await fetch('/api/mappings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant,
          category: editValues.category || null,
          classification: editValues.classification || null,
          notes: editValues.notes || null,
        }),
      })
      setMappings(prev =>
        prev.map(m =>
          m.merchant === merchant
            ? { ...m, category: editValues.category || null, classification: editValues.classification || null, notes: editValues.notes || null }
            : m
        )
      )
      setEditingMerchant(null)
    } finally {
      setSaving(false)
    }
  }, [editValues])

  const deleteMapping = async (merchant: string) => {
    if (!confirm(`Delete mapping for "${merchant}"?`)) return
    await fetch(`/api/mappings?merchant=${encodeURIComponent(merchant)}`, { method: 'DELETE' })
    setMappings(prev => prev.filter(m => m.merchant !== merchant))
  }

  const applyAllRules = async () => {
    setIsApplying(true)
    setApplyResult(null)
    try {
      const res = await fetch('/api/mappings', { method: 'POST' })
      const data = await res.json()
      setApplyResult(data.applied || 0)
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search merchants..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <button
          onClick={applyAllRules}
          disabled={isApplying}
          className="flex items-center gap-2 bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 transition-colors"
        >
          <ArrowPathIcon className={`h-4 w-4 ${isApplying ? 'animate-spin' : ''}`} />
          Apply all rules
        </button>
      </div>

      {applyResult !== null && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-800">
          <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
          Applied {applyResult} rules to all transactions
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {search ? 'No merchants match your search.' : 'No merchant mappings yet. They are created automatically when you categorise a transaction.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Merchant</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Classification</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Notes</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Txns</th>
                  <th className="w-16 px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(m => (
                  <tr key={m.merchant} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{m.merchant}</td>

                    {editingMerchant === m.merchant ? (
                      <>
                        <td className="px-4 py-3">
                          <select
                            value={editValues.category}
                            onChange={e => setEditValues(v => ({ ...v, category: e.target.value }))}
                            className="text-sm border border-emerald-400 rounded px-2 py-1 focus:outline-none w-full"
                          >
                            <option value="">Uncategorised</option>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <select
                            value={editValues.classification}
                            onChange={e => setEditValues(v => ({ ...v, classification: e.target.value }))}
                            className="text-sm border border-emerald-400 rounded px-2 py-1 focus:outline-none w-full"
                          >
                            <option value="">None</option>
                            {CLASSIFICATIONS.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <input
                            type="text"
                            value={editValues.notes}
                            onChange={e => setEditValues(v => ({ ...v, notes: e.target.value }))}
                            placeholder="Optional notes..."
                            className="text-sm border border-emerald-400 rounded px-2 py-1 focus:outline-none w-full"
                          />
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">{m.transaction_count}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => saveEdit(m.merchant)}
                              disabled={saving}
                              className="text-xs bg-emerald-700 text-white rounded px-3 py-1 hover:bg-emerald-800 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => startEdit(m)}
                            className={`text-sm rounded px-2 py-0.5 hover:bg-gray-100 transition-all ${
                              m.category ? 'text-gray-700' : 'text-gray-300 italic'
                            }`}
                          >
                            {m.category || 'Uncategorised'}
                          </button>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <button
                            onClick={() => startEdit(m)}
                            className={`text-sm rounded px-2 py-0.5 hover:bg-gray-100 transition-all ${
                              m.classification ? 'text-gray-600' : 'text-gray-300'
                            }`}
                          >
                            {m.classification || '—'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">
                          {m.notes || '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">{m.transaction_count}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => deleteMapping(m.merchant)}
                            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
