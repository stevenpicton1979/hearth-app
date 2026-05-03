import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── DB state ──────────────────────────────────────────────────────────────────

const db = vi.hoisted(() => ({
  existing: null as null | { id: string; cancelled_at: string | null },
  updated: null as null | Record<string, unknown>,
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
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({
                  data: db.updateError ? null : (db.updated ?? updates),
                  error: db.updateError ? { message: db.updateError } : null,
                }),
              }),
            }),
          }),
        }
      },
    }),
  }),
}))

import { POST } from '@/app/api/subscriptions/[id]/cancel/route'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/subscriptions/sub-1/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function reqEmpty() {
  return new NextRequest('http://localhost/api/subscriptions/sub-1/cancel', {
    method: 'POST',
  })
}

const params = { params: { id: 'sub-1' } }

const today = new Date().toISOString().slice(0, 10)

beforeEach(() => {
  db.existing = null
  db.updated = null
  db.updateError = null
  db.capturedUpdates = null
})

describe('POST /api/subscriptions/:id/cancel', () => {
  it('returns 400 for invalid JSON', async () => {
    const badReq = new NextRequest('http://localhost/api/subscriptions/sub-1/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(badReq, params)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/json/i)
  })

  it('returns 400 for invalid cancelled_at date string', async () => {
    const res = await POST(req({ cancelled_at: 'not-a-date' }), params)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/valid date/i)
  })

  it('returns 400 when cancelled_at is in the future', async () => {
    const future = new Date()
    future.setDate(future.getDate() + 5)
    const futureStr = future.toISOString().slice(0, 10)
    const res = await POST(req({ cancelled_at: futureStr }), params)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/future/i)
  })

  it('returns 404 when subscription not found', async () => {
    db.existing = null
    const res = await POST(req({ cancelled_at: today }), params)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/not found/i)
  })

  it('returns 200 and sets cancelled_at to today when body is empty', async () => {
    db.existing = { id: 'sub-1', cancelled_at: null }
    db.updated = { id: 'sub-1', is_active: false, cancelled_at: today }
    const res = await POST(reqEmpty(), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.subscription).toBeDefined()
    expect(db.capturedUpdates?.cancelled_at).toBe(today)
    expect(db.capturedUpdates?.is_active).toBe(false)
  })

  it('returns 200 and sets provided cancelled_at date', async () => {
    const past = '2025-03-15'
    db.existing = { id: 'sub-1', cancelled_at: null }
    db.updated = { id: 'sub-1', is_active: false, cancelled_at: past }
    const res = await POST(req({ cancelled_at: past }), params)
    expect(res.status).toBe(200)
    expect(db.capturedUpdates?.cancelled_at).toBe(past)
  })

  it('is idempotent: does not overwrite existing cancelled_at', async () => {
    const original = '2025-01-10'
    db.existing = { id: 'sub-1', cancelled_at: original }
    db.updated = { id: 'sub-1', is_active: false, cancelled_at: original }
    const res = await POST(req({ cancelled_at: today }), params)
    expect(res.status).toBe(200)
    // cancelled_at must NOT be set in the update payload when already set
    expect(db.capturedUpdates).not.toHaveProperty('cancelled_at')
  })

  it('passes auto_cancelled flag through when provided', async () => {
    db.existing = { id: 'sub-1', cancelled_at: null }
    db.updated = { id: 'sub-1', is_active: false, cancelled_at: today, auto_cancelled: true }
    const res = await POST(req({ auto_cancelled: true }), params)
    expect(res.status).toBe(200)
    expect(db.capturedUpdates?.auto_cancelled).toBe(true)
  })

  it('does not include auto_cancelled in update when not provided', async () => {
    db.existing = { id: 'sub-1', cancelled_at: null }
    db.updated = { id: 'sub-1', is_active: false, cancelled_at: today }
    const res = await POST(req({}), params)
    expect(res.status).toBe(200)
    expect(db.capturedUpdates).not.toHaveProperty('auto_cancelled')
  })

  it('returns 500 on database error', async () => {
    db.existing = { id: 'sub-1', cancelled_at: null }
    db.updateError = 'DB failure'
    const res = await POST(req({}), params)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('DB failure')
  })
})
