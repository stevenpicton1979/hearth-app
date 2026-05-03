import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Shared DB state ───────────────────────────────────────────────────────────
// Both DELETE and restore route have the same shape:
//   select(...).eq(...).eq(...).maybeSingle()       → existing
//   update({...}).eq(...).eq(...)                   → { error }

const db = vi.hoisted(() => ({
  existing: null as null | { id: string; cancelled_at: string | null; is_active?: boolean },
  updateError: null as string | null,
  capturedUpdates: null as null | Record<string, unknown>,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: db.existing, error: null }),
          }),
        }),
      }),
      update: (updates: Record<string, unknown>) => {
        db.capturedUpdates = updates
        return {
          eq: () => ({
            eq: () =>
              Promise.resolve({ error: db.updateError ? { message: db.updateError } : null }),
          }),
        }
      },
    }),
  }),
}))

import { DELETE } from '@/app/api/subscriptions/[id]/route'
import { POST as restorePOST } from '@/app/api/subscriptions/[id]/restore/route'

const today = new Date().toISOString().slice(0, 10)
const params = { params: { id: 'sub-1' } }

function deleteReq() {
  return new NextRequest('http://localhost/api/subscriptions/sub-1', { method: 'DELETE' })
}
function restoreReq() {
  return new NextRequest('http://localhost/api/subscriptions/sub-1/restore', { method: 'POST' })
}

beforeEach(() => {
  db.existing = null
  db.updateError = null
  db.capturedUpdates = null
})

// ── DELETE /api/subscriptions/:id ─────────────────────────────────────────────

describe('DELETE /api/subscriptions/:id', () => {
  it('returns 404 when subscription not found', async () => {
    db.existing = null
    const res = await DELETE(deleteReq(), params)
    expect(res.status).toBe(404)
  })

  it('sets is_active=false, cancelled_at=today, auto_cancelled=false', async () => {
    db.existing = { id: 'sub-1', cancelled_at: null }
    const res = await DELETE(deleteReq(), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(db.capturedUpdates?.is_active).toBe(false)
    expect(db.capturedUpdates?.cancelled_at).toBe(today)
    expect(db.capturedUpdates?.auto_cancelled).toBe(false)
  })

  it('returns 500 on database error', async () => {
    db.existing = { id: 'sub-1', cancelled_at: null }
    db.updateError = 'DB error'
    const res = await DELETE(deleteReq(), params)
    expect(res.status).toBe(500)
  })
})

// ── POST /api/subscriptions/:id/restore ──────────────────────────────────────

describe('POST /api/subscriptions/:id/restore', () => {
  it('returns 404 when subscription not found', async () => {
    db.existing = null
    const res = await restorePOST(restoreReq(), params)
    expect(res.status).toBe(404)
  })

  it('sets is_active=true, clears cancelled_at and auto_cancelled', async () => {
    db.existing = { id: 'sub-1', cancelled_at: '2025-01-01', is_active: false }
    const res = await restorePOST(restoreReq(), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(db.capturedUpdates?.is_active).toBe(true)
    expect(db.capturedUpdates?.cancelled_at).toBeNull()
    expect(db.capturedUpdates?.auto_cancelled).toBe(false)
  })

  it('is idempotent: restoring an already-active subscription succeeds', async () => {
    db.existing = { id: 'sub-1', cancelled_at: null, is_active: true }
    const res = await restorePOST(restoreReq(), params)
    expect(res.status).toBe(200)
  })

  it('returns 500 on database error', async () => {
    db.existing = { id: 'sub-1', cancelled_at: '2025-01-01', is_active: false }
    db.updateError = 'DB error'
    const res = await restorePOST(restoreReq(), params)
    expect(res.status).toBe(500)
  })
})
