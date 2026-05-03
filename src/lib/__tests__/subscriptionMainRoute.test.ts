import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── DB state ──────────────────────────────────────────────────────────────────

const db = vi.hoisted(() => ({
  subscriptions: [] as Array<{
    id: string
    name: string
    is_active: boolean
    cancelled_at: string | null
    auto_cancelled: boolean
    subscription_merchants: { merchant: string }[]
    [key: string]: unknown
  }>,
  transactions: [] as Array<{ merchant: string; amount: number }>,
  existingLink: null as null | { subscription_id: string },
  insertedSub: null as null | Record<string, unknown>,
  insertedMerchant: null as null | Record<string, unknown>,
  insertError: null as string | null,
  merchantLinkError: null as string | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => {
    return {
      from: (table: string) => {
        if (table === 'subscriptions') {
          return {
            select: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: db.subscriptions, error: null }),
              }),
            }),
            insert: (row: Record<string, unknown>) => {
              db.insertedSub = row
              return {
                select: () => ({
                  single: () => Promise.resolve({
                    data: db.insertError ? null : { ...row, id: 'new-sub-id' },
                    error: db.insertError ? { message: db.insertError } : null,
                  }),
                }),
              }
            },
          }
        }

        if (table === 'transactions') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  lt: () => ({
                    in: () => Promise.resolve({ data: db.transactions, error: null }),
                  }),
                }),
              }),
            }),
          }
        }

        if (table === 'subscription_merchants') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: db.existingLink, error: null }),
                }),
              }),
            }),
            insert: (row: Record<string, unknown>) => {
              db.insertedMerchant = row
              return Promise.resolve({ error: db.merchantLinkError ? { message: db.merchantLinkError } : null })
            },
          }
        }

        // merchant_mappings upsert
        return {
          upsert: () => Promise.resolve({ error: null }),
        }
      },
    }
  },
}))

import { GET, POST } from '@/app/api/subscriptions/route'
import { computeMonthsSince } from '@/lib/subscriptionUtils'

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  db.subscriptions = []
  db.transactions = []
  db.existingLink = null
  db.insertedSub = null
  db.insertedMerchant = null
  db.insertError = null
  db.merchantLinkError = null
})

// ── computeMonthsSince ────────────────────────────────────────────────────────

describe('computeMonthsSince', () => {
  it('returns 0 for today', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(computeMonthsSince(today)).toBe(0)
  })

  it('returns ~1 for ~30 days ago', () => {
    const d = new Date()
    d.setDate(d.getDate() - 31)
    const months = computeMonthsSince(d.toISOString().slice(0, 10))
    expect(months).toBe(1)
  })

  it('returns ~12 for ~365 days ago', () => {
    const d = new Date()
    d.setDate(d.getDate() - 365)
    const months = computeMonthsSince(d.toISOString().slice(0, 10))
    expect(months).toBeGreaterThanOrEqual(11)
    expect(months).toBeLessThanOrEqual(12)
  })
})

// ── GET /api/subscriptions ────────────────────────────────────────────────────

describe('GET /api/subscriptions', () => {
  it('returns empty list when no subscriptions', async () => {
    db.subscriptions = []
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.subscriptions).toHaveLength(0)
  })

  it('computes lifetime_spend from linked merchants', async () => {
    db.subscriptions = [{
      id: 'sub-1',
      name: 'Netflix',
      is_active: true,
      cancelled_at: null,
      auto_cancelled: false,
      subscription_merchants: [{ merchant: 'NETFLIX' }],
    }]
    db.transactions = [
      { merchant: 'NETFLIX', amount: -19.99 },
      { merchant: 'NETFLIX', amount: -19.99 },
    ]
    const res = await GET()
    const body = await res.json()
    expect(body.subscriptions[0].lifetime_spend).toBeCloseTo(39.98, 1)
  })

  it('sets months_since_cancelled for cancelled subscriptions', async () => {
    const d = new Date()
    d.setDate(d.getDate() - 31)
    const cancelledAt = d.toISOString().slice(0, 10)

    db.subscriptions = [{
      id: 'sub-2',
      name: 'Old Sub',
      is_active: false,
      cancelled_at: cancelledAt,
      auto_cancelled: false,
      subscription_merchants: [],
    }]
    db.transactions = []

    const res = await GET()
    const body = await res.json()
    expect(body.subscriptions[0].months_since_cancelled).toBe(1)
  })

  it('sets months_since_cancelled=null for active subscriptions', async () => {
    db.subscriptions = [{
      id: 'sub-3',
      name: 'Active Sub',
      is_active: true,
      cancelled_at: null,
      auto_cancelled: false,
      subscription_merchants: [],
    }]
    const res = await GET()
    const body = await res.json()
    expect(body.subscriptions[0].months_since_cancelled).toBeNull()
  })

  it('sums lifetime_spend across multiple merchants', async () => {
    db.subscriptions = [{
      id: 'sub-4',
      name: 'Multi',
      is_active: true,
      cancelled_at: null,
      auto_cancelled: false,
      subscription_merchants: [{ merchant: 'MERCHANT_A' }, { merchant: 'MERCHANT_B' }],
    }]
    db.transactions = [
      { merchant: 'MERCHANT_A', amount: -50 },
      { merchant: 'MERCHANT_B', amount: -30 },
    ]
    const res = await GET()
    const body = await res.json()
    expect(body.subscriptions[0].lifetime_spend).toBeCloseTo(80, 1)
  })
})

// ── POST /api/subscriptions ───────────────────────────────────────────────────

describe('POST /api/subscriptions', () => {
  it('returns 400 when name is missing', async () => {
    const res = await POST(postReq({ initial_merchant: 'ACME' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/name/i)
  })

  it('returns 400 when initial_merchant is missing', async () => {
    const res = await POST(postReq({ name: 'Acme Sub' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/initial_merchant/i)
  })

  it('returns 400 when is_active=false but cancelled_at not provided', async () => {
    const res = await POST(postReq({ name: 'Acme', initial_merchant: 'ACME', is_active: false }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/cancelled_at/i)
  })

  it('returns 400 when cancelled_at is in the future', async () => {
    const future = new Date()
    future.setDate(future.getDate() + 3)
    const res = await POST(postReq({
      name: 'Acme',
      initial_merchant: 'ACME',
      is_active: false,
      cancelled_at: future.toISOString().slice(0, 10),
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/future/i)
  })

  it('returns 409 when merchant already linked', async () => {
    db.existingLink = { subscription_id: 'existing-sub' }
    const res = await POST(postReq({ name: 'Acme', initial_merchant: 'ACME' }))
    expect(res.status).toBe(409)
  })

  it('creates active subscription with is_active=true by default', async () => {
    db.existingLink = null
    const res = await POST(postReq({ name: 'Spotify', initial_merchant: 'SPOTIFY' }))
    expect(res.status).toBe(201)
    expect(db.insertedSub?.is_active).toBe(true)
    expect(db.insertedSub?.cancelled_at).toBeNull()
  })

  it('creates cancelled subscription when is_active=false and cancelled_at provided', async () => {
    db.existingLink = null
    const past = '2025-02-01'
    const res = await POST(postReq({
      name: 'Old Service',
      initial_merchant: 'OLD_SVC',
      is_active: false,
      cancelled_at: past,
    }))
    expect(res.status).toBe(201)
    expect(db.insertedSub?.is_active).toBe(false)
    expect(db.insertedSub?.cancelled_at).toBe(past)
    const body = await res.json()
    expect(body.subscription.merchants).toContain('OLD_SVC')
  })

  it('returns 400 for invalid JSON', async () => {
    const badReq = new NextRequest('http://localhost/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(badReq)
    expect(res.status).toBe(400)
  })
})
