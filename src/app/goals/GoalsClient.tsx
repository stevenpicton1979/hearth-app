'use client'

import { useState } from 'react'
import { PencilIcon, TrashIcon, PlusIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline'
import { Goal } from '@/lib/types'

interface AccountRow {
  id: string
  display_name: string
  current_balance: number | null
}

interface Props {
  initialGoals: Goal[]
  accounts: AccountRow[]
}

const EMOJI_PICKER = [
  '🏠', '🚗', '✈️', '🎓', '💍', '🏖️', '💻', '🎯', '💰', '🏋️',
  '🐕', '🌱', '🛡️', '🎸', '📱', '🎁', '🏥', '🚀', '💎', '🔑',
]

const aud = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

interface AddGoalForm {
  name: string
  emoji: string
  target_amount: string
  current_amount: string
  target_date: string
  linked_account_id: string
}

const defaultForm = (): AddGoalForm => ({
  name: '',
  emoji: '🎯',
  target_amount: '',
  current_amount: '',
  target_date: '',
  linked_account_id: '',
})

export function GoalsClient({ initialGoals, accounts }: Props) {
  const [goals, setGoals] = useState<Goal[]>(initialGoals)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AddGoalForm>(defaultForm())
  const [editForm, setEditForm] = useState<AddGoalForm>(defaultForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const activeGoals = goals.filter(g => !g.is_complete)
  const archivedGoals = goals.filter(g => g.is_complete)

  function getCurrentAmount(goal: Goal): number {
    if (goal.linked_account_id) {
      const acc = accounts.find(a => a.id === goal.linked_account_id)
      return acc?.current_balance ?? goal.current_amount
    }
    return goal.current_amount
  }

  async function handleCreate() {
    if (!form.name || !form.target_amount) return setError('Name and target amount are required')
    setSaving(true)
    setError('')
    try {
      const body = {
        name: form.name,
        emoji: form.emoji || null,
        target_amount: parseFloat(form.target_amount),
        current_amount: form.linked_account_id ? 0 : parseFloat(form.current_amount || '0'),
        target_date: form.target_date || null,
        linked_account_id: form.linked_account_id || null,
      }
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGoals(prev => [data.goal, ...prev])
      setForm(defaultForm())
      setShowAdd(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create goal')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(id: string) {
    if (!editForm.name || !editForm.target_amount) return setError('Name and target amount are required')
    setSaving(true)
    setError('')
    try {
      const body = {
        id,
        name: editForm.name,
        emoji: editForm.emoji || null,
        target_amount: parseFloat(editForm.target_amount),
        current_amount: editForm.linked_account_id ? 0 : parseFloat(editForm.current_amount || '0'),
        target_date: editForm.target_date || null,
        linked_account_id: editForm.linked_account_id || null,
      }
      const res = await fetch('/api/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGoals(prev => prev.map(g => (g.id === id ? data.goal : g)))
      setEditingId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update goal')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this goal?')) return
    const res = await fetch(`/api/goals?id=${id}`, { method: 'DELETE' })
    if (res.ok) setGoals(prev => prev.filter(g => g.id !== id))
  }

  async function handleArchive(id: string) {
    const res = await fetch('/api/goals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_complete: true }),
    })
    const data = await res.json()
    if (res.ok) setGoals(prev => prev.map(g => (g.id === id ? data.goal : g)))
  }

  function startEdit(goal: Goal) {
    setEditingId(goal.id)
    setEditForm({
      name: goal.name,
      emoji: goal.emoji || '🎯',
      target_amount: String(goal.target_amount),
      current_amount: String(goal.current_amount),
      target_date: goal.target_date || '',
      linked_account_id: goal.linked_account_id || '',
    })
  }

  function GoalForm({
    f,
    setF,
    onSubmit,
    onCancel,
    submitLabel,
  }: {
    f: AddGoalForm
    setF: (v: AddGoalForm) => void
    onSubmit: () => void
    onCancel: () => void
    submitLabel: string
  }) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
        {/* Emoji picker */}
        <div>
          <label className="text-xs text-gray-500 block mb-2">Emoji</label>
          <div className="flex flex-wrap gap-1.5">
            {EMOJI_PICKER.map(e => (
              <button
                key={e}
                type="button"
                onClick={() => setF({ ...f, emoji: e })}
                className={`text-lg w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                  f.emoji === e ? 'bg-emerald-100 ring-2 ring-emerald-500' : 'hover:bg-gray-200 bg-white border border-gray-200'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Goal name</label>
            <input
              type="text"
              placeholder="e.g. Emergency fund"
              value={f.name}
              onChange={e => setF({ ...f, name: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Target amount</label>
            <input
              type="number"
              min="0"
              step="100"
              placeholder="10000"
              value={f.target_amount}
              onChange={e => setF({ ...f, target_amount: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Target date (optional)</label>
            <input
              type="date"
              value={f.target_date}
              onChange={e => setF({ ...f, target_date: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Link to account (optional)</label>
            <select
              value={f.linked_account_id}
              onChange={e => setF({ ...f, linked_account_id: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">None — enter manually</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.display_name}</option>
              ))}
            </select>
          </div>
          {!f.linked_account_id && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Current amount</label>
              <input
                type="number"
                min="0"
                step="100"
                placeholder="0"
                value={f.current_amount}
                onChange={e => setF({ ...f, current_amount: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className="bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : submitLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  function GoalCard({ goal }: { goal: Goal }) {
    const current = getCurrentAmount(goal)
    const target = goal.target_amount
    const percent = target > 0 ? Math.min(100, (current / target) * 100) : 0
    const reached = current >= target
    const days = goal.target_date ? daysUntil(goal.target_date) : null

    if (editingId === goal.id) {
      return (
        <div className="bg-white border-2 border-emerald-300 rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Edit Goal</h3>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <GoalForm
            f={editForm}
            setF={setEditForm}
            onSubmit={() => handleUpdate(goal.id)}
            onCancel={() => setEditingId(null)}
            submitLabel="Save changes"
          />
        </div>
      )
    }

    return (
      <div
        className={`bg-white rounded-xl p-5 border-2 transition-colors ${
          reached ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200'
        }`}
      >
        {reached && (
          <div className="flex items-center gap-2 mb-3 text-emerald-700 font-semibold">
            <span>🎉</span>
            <span>Goal reached!</span>
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {goal.emoji && <span className="text-2xl flex-shrink-0">{goal.emoji}</span>}
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">{goal.name}</h3>
              {goal.linked_account_id && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Linked to {accounts.find(a => a.id === goal.linked_account_id)?.display_name || 'account'}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => startEdit(goal)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="Edit"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
            {reached && !goal.is_complete && (
              <button
                onClick={() => handleArchive(goal.id)}
                className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors"
                title="Archive"
              >
                <ArchiveBoxIcon className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => handleDelete(goal.id)}
              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
              title="Delete"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="font-medium text-gray-900">{aud(current)}</span>
            <span className="text-gray-500">of {aud(target)}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all ${reached ? 'bg-emerald-500' : 'bg-emerald-600'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{percent.toFixed(0)}% complete</span>
            {days !== null && (
              <span className={days < 0 ? 'text-red-500' : days <= 30 ? 'text-amber-600' : ''}>
                {days < 0 ? `${Math.abs(days)} days overdue` : `${days} days to go`}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {error && !editingId && !showAdd && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Add goal button / form */}
      {showAdd ? (
        <div>
          <h2 className="font-semibold text-gray-900 mb-3">New Goal</h2>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <GoalForm
            f={form}
            setF={setForm}
            onSubmit={handleCreate}
            onCancel={() => { setShowAdd(false); setError('') }}
            submitLabel="Create goal"
          />
        </div>
      ) : (
        <button
          onClick={() => { setShowAdd(true); setError('') }}
          className="flex items-center gap-2 bg-emerald-700 text-white rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-emerald-800 transition-colors"
        >
          <PlusIcon className="h-4 w-4" />
          Add goal
        </button>
      )}

      {/* Active goals */}
      {activeGoals.length === 0 && !showAdd ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">No goals yet. Add your first goal above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {activeGoals.map(goal => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      )}

      {/* Archived goals */}
      {archivedGoals.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Archived</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 opacity-60">
            {archivedGoals.map(goal => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
