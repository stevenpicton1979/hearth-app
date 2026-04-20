'use client'

import { useState, useEffect } from 'react'
import { CATEGORIES } from '@/lib/constants'
import { PlusIcon } from '@heroicons/react/24/outline'

interface CategoryPref {
  id: string
  category: string
  is_hidden: boolean
  display_name: string | null
}

export default function CategoriesPage() {
  const [prefs, setPrefs] = useState<CategoryPref[]>([])
  const [loading, setLoading] = useState(true)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [addingCustom, setAddingCustom] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then(d => setPrefs(d.prefs || []))
      .finally(() => setLoading(false))
  }, [])

  function getPref(category: string): CategoryPref | undefined {
    return prefs.find(p => p.category === category)
  }

  function getDisplayName(category: string): string {
    return getPref(category)?.display_name || category
  }

  function isHidden(category: string): boolean {
    return getPref(category)?.is_hidden || false
  }

  async function toggleHidden(category: string) {
    const current = isHidden(category)
    setSaving(true)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, is_hidden: !current, display_name: getPref(category)?.display_name || null }),
      })
      const data = await res.json()
      if (res.ok) {
        setPrefs(prev => {
          const existing = prev.find(p => p.category === category)
          if (existing) return prev.map(p => p.category === category ? data.pref : p)
          return [...prev, data.pref]
        })
      }
    } finally {
      setSaving(false)
    }
  }

  async function saveDisplayName(category: string) {
    setSaving(true)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, display_name: editName || null, is_hidden: isHidden(category) }),
      })
      const data = await res.json()
      if (res.ok) {
        setPrefs(prev => {
          const existing = prev.find(p => p.category === category)
          if (existing) return prev.map(p => p.category === category ? data.pref : p)
          return [...prev, data.pref]
        })
      }
    } finally {
      setSaving(false)
      setEditingCategory(null)
      setEditName('')
    }
  }

  async function handleAddCustom() {
    if (!newCategory.trim()) return
    const category = newCategory.trim()
    setSaving(true)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, is_hidden: false, display_name: null }),
      })
      const data = await res.json()
      if (res.ok) {
        setPrefs(prev => [...prev, data.pref])
        setNewCategory('')
        setAddingCustom(false)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDeletePref(category: string) {
    await fetch(`/api/categories?category=${encodeURIComponent(category)}`, { method: 'DELETE' })
    setPrefs(prev => prev.filter(p => p.category !== category))
  }

  // All known categories: built-in + any custom (prefs not in CATEGORIES)
  const builtInSet = new Set(CATEGORIES as readonly string[])
  const customCategories = prefs.filter(p => !builtInSet.has(p.category))

  const allCategories = [...CATEGORIES as readonly string[], ...customCategories.map(p => p.category)]

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
        <p className="text-sm text-gray-500 mt-1">
          Hide categories you don&apos;t use, or rename them to match your preferences.
        </p>
      </div>

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">Loading...</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <span>Category</span>
              <span>Show/Hide</span>
              <span className="w-20"></span>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {allCategories.map(category => {
              const hidden = isHidden(category)
              const displayName = getDisplayName(category)
              const isCustom = !builtInSet.has(category)

              return (
                <div
                  key={category}
                  className={`px-4 py-3 transition-colors ${hidden ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                >
                  <div className="grid grid-cols-[1fr_auto_auto] gap-4 items-center">
                    {/* Name (click to rename) */}
                    <div>
                      {editingCategory === category ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveDisplayName(category)
                              if (e.key === 'Escape') { setEditingCategory(null); setEditName('') }
                            }}
                            placeholder={category}
                            className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-40"
                            autoFocus
                          />
                          <button
                            onClick={() => saveDisplayName(category)}
                            disabled={saving}
                            className="text-xs bg-emerald-700 text-white rounded px-2 py-1 hover:bg-emerald-800 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingCategory(null); setEditName('') }}
                            className="text-xs text-gray-400 hover:text-gray-600 px-1 py-1"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingCategory(category); setEditName(getPref(category)?.display_name || '') }}
                          className={`text-sm text-left hover:text-emerald-700 transition-colors ${hidden ? 'text-gray-400 line-through' : 'text-gray-900 font-medium'}`}
                          title="Click to rename"
                        >
                          {displayName}
                          {displayName !== category && (
                            <span className="text-xs text-gray-400 ml-2">(was: {category})</span>
                          )}
                        </button>
                      )}
                      {isCustom && (
                        <span className="text-xs text-amber-600 ml-1">custom</span>
                      )}
                    </div>

                    {/* Toggle */}
                    <button
                      onClick={() => toggleHidden(category)}
                      disabled={saving}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                        !hidden ? 'bg-emerald-600' : 'bg-gray-200'
                      }`}
                      role="switch"
                      aria-checked={!hidden}
                      title={hidden ? 'Show category' : 'Hide category'}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          !hidden ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>

                    {/* Actions */}
                    <div className="w-20 flex justify-end">
                      {isCustom && (
                        <button
                          onClick={() => handleDeletePref(category)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Add custom category */}
          <div className="px-4 py-4 border-t border-gray-200 bg-gray-50">
            {addingCustom ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddCustom()
                    if (e.key === 'Escape') { setAddingCustom(false); setNewCategory('') }
                  }}
                  placeholder="e.g. Baby Expenses"
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-48"
                  autoFocus
                />
                <button
                  onClick={handleAddCustom}
                  disabled={saving || !newCategory.trim()}
                  className="text-sm bg-emerald-700 text-white rounded-lg px-3 py-2 hover:bg-emerald-800 disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  onClick={() => { setAddingCustom(false); setNewCategory('') }}
                  className="text-sm text-gray-400 hover:text-gray-600 px-2 py-2"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingCustom(true)}
                className="flex items-center gap-1.5 text-sm text-emerald-700 hover:text-emerald-900 font-medium"
              >
                <PlusIcon className="h-4 w-4" /> Add custom category
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
