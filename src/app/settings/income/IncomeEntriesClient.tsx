'use client'

import { useState } from 'react'
import { PlusIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline'
import { CATEGORIES } from '@/lib/constants'

interface Entry {
  id: string
  date: string
  amount: number
  description: string
  category: string
  recipient: string | null
  financial_year: string | null
}

type EditForm = {
  date: string
  amount: string
  description: string
  category: string
  recipient: string
  financial_year: string
}

const aud = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)

const INCOME_CATEGORIES = CATEGORIES.filter(c =>
  ['Director Income', 'Business', 'Government & Tax', 'Other'].includes(c)
)

function entryToForm(e: Entry): EditForm {
  return {
    date: e.date,
    amount: String(e.amount),
    description: e.description,
    category: e.category,
    recipient: e.recipient || '',
    financial_year: e.financial_year || '',
  }
}

export function IncomeEntriesClient({ initialEntries }: { initialEntries: Entry[] }) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const [form, setForm] = useState<EditForm>({
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    description: '',
    category: 'Director Income',
    recipient: '',
    financial_year: '',
  })

  async function handleAdd() {
    if (!form.date || !form.amount || !form.description) {
      setError('Date, amount, and description are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/manual-income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEntries(prev => [data.entry, ...prev])
      setForm({ date: new Date().toISOString().slice(0, 10), amount: '', description: '', category: 'Director Income', recipient: '', financial_year: '' })
      setShowForm(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(entry: Entry) {
    setEditingId(entry.id)
    setEditForm(entryToForm(entry))
    setEditError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm(null)
    setEditError('')
  }

  async function handleSaveEdit() {
    if (!editingId || !editForm) return
    if (!editForm.date || !editForm.amount || !editForm.description) {
      setEditError('Date, amount, and description are required.')
      return
    }
    setEditSaving(true)
    setEditError('')
    try {
      const res = await fetch('/api/manual-income', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...editForm }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEntries(prev => prev.map(e => e.id === editingId ? data.entry : e))
      cancelEdit()
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this entry?')) return
    const res = await fetch(`/api/manual-income?id=${id}`, { method: 'DELETE' })
    if (res.ok) setEntries(prev => prev.filter(e => e.id !== id))
  }

  const total = entries.reduce((s, e) => s + e.amount, 0)

  const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500'

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{entries.length} entries · Total {aud(total)}</span>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-800 transition-colors"
        >
          <PlusIcon className="h-4 w-4" />
          Add entry
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="font-medium text-gray-900">New income entry</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Amount (AUD)</label>
              <input type="number" min="0.01" step="0.01" placeholder="1000.00" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Description</label>
              <input type="text" placeholder="e.g. Director fee – March invoice" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inputCls}>
                {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Recipient (optional)</label>
              <input type="text" placeholder="e.g. John Smith" value={form.recipient} onChange={e => setForm(f => ({ ...f, recipient: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Financial year (optional)</label>
              <input type="text" placeholder="e.g. FY2025" value={form.financial_year} onChange={e => setForm(f => ({ ...f, financial_year: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleAdd} disabled={saving} className="bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : 'Save entry'}
            </button>
            <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">No manual income entries yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Category</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="w-20 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map(entry => (
                editingId === entry.id && editForm ? (
                  <tr key={entry.id} className="bg-gray-50">
                    <td colSpan={5} className="px-4 py-4">
                      {editError && (
                        <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">{editError}</div>
                      )}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Date</label>
                          <input type="date" value={editForm.date} onChange={e => setEditForm(f => f ? { ...f, date: e.target.value } : f)} className={inputCls} />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Amount</label>
                          <input type="number" min="0.01" step="0.01" value={editForm.amount} onChange={e => setEditForm(f => f ? { ...f, amount: e.target.value } : f)} className={inputCls} />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Category</label>
                          <select value={editForm.category} onChange={e => setEditForm(f => f ? { ...f, category: e.target.value } : f)} className={inputCls}>
                            {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2 md:col-span-3">
                          <label className="text-xs text-gray-500 block mb-1">Description</label>
                          <input type="text" value={editForm.description} onChange={e => setEditForm(f => f ? { ...f, description: e.target.value } : f)} className={inputCls} />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Recipient</label>
                          <input type="text" value={editForm.recipient} onChange={e => setEditForm(f => f ? { ...f, recipient: e.target.value } : f)} className={inputCls} />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Financial year</label>
                          <input type="text" value={editForm.financial_year} onChange={e => setEditForm(f => f ? { ...f, financial_year: e.target.value } : f)} className={inputCls} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleSaveEdit} disabled={editSaving} className="bg-emerald-700 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 transition-colors">
                          {editSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={cancelEdit} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {new Date(entry.date + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{entry.description}</div>
                      {entry.recipient && <div className="text-xs text-gray-400">{entry.recipient}</div>}
                      {entry.financial_year && <div className="text-xs text-gray-400">{entry.financial_year}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{entry.category}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-700">{aud(entry.amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => startEdit(entry)}
                          className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                          title="Edit"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
