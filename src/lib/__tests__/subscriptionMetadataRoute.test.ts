import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ── DB state ──────────────────────────────────────────────────────────────────
const db = vi.hoisted(() => ({
  metadata: null as null | {
    merchant: string
    household_id: string
    cancellation_url: string | null
    account_email: string | null
    notes: string | null
    auto_renews: boolean
    next_renewal_override: string | null
    category: string | null
    created_at: string
    updated_at: string
  },
  mapping: null as null | { classification: string | null },
  readError: null as string | null,
  upsertError: null as string | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === 'merchant_mappings') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: db.mapping, error: null }),
              }),
            }),
          }),
        }
      }

      // subscription_metadata — handles both read chains and upsert
      const readChain: Record<string, unknown> = {}
      readChain.eq = () => readChain
      readChain.maybeSingle = () =>
        Promise.resolve({
          data: db.metadata,
          error: db.readError ? { message: db.readError } : null,
        })

      return {
        select: () => readChain,
        upsert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: db.upsertError ? null : row,
                error: db.upsertError ? { message: db.upsertError } : null,
              }),
          }),
        }),
      }
    },
  }),
}))

import { GET, PUT } from '@/app/api/subscriptions/metadata/route'

function getReq(qs = '') {
  return new NextRequest(`http://localhost/api/subscriptions/metadata${qs ? `?${qs}` : ''}`)
}

function putReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/subscriptions/metadata', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── GET tests ─────────────────────────────────────────────────────────────────
describe('GET /api/subscriptions/metadata', () => {
  it('returns 400 when merchant param is missing', async () => {
    const res = await GET(getReq())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/merchant/)
  })

  it('returns 404 when no metadata row exists', async () => {
    db.metadata = null
    const res = await GET(getReq('merchant=NETFLIX'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('not found')
  })

  it('returns 200 with metadata when row exists', async () => {
    db.metadata = {
      merchant: 'NETFLIX',
      household_id: 'hh-1',
      cancellation_url: 'https://netflix.com/cancel',
      account_email: 'user@example.com',
      notes: null,
      auto_renews: true,
      next_renewal_override: null,
      category: 'Entertainment',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
    }
    const res = await GET(getReq('merchant=NETFLIX'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.merchant).toBe('NETFLIX')
    expect(body.cancellation_url).toBe('https://netflix.com/cancel')
    expect(body.account_email).toBe('user@example.com')
    expect(body.auto_renews).toBe(true)
  })

  it('returns 500 on database error', async () => {
    db.metadata = null
    db.readError = 'connection error'
    const res = await GET(getReq('merchant=NETFLIX'))
    expect(res.status).toBe(500)
    db.readError = null
  })
})

// ── PUT tests ─────────────────────────────────────────────────────────────────
describe('PUT /api/subscriptions/metadata', () => {
  it('returns 400 when merchant is missing from body', async () => {
    const res = await PUT(putReq({ cancellation_url: 'https://example.com' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/merchant/)
  })

  it('returns 400 when merchant has no merchant_mappings row', async () => {
    db.mapping = null
    const res = await PUT(putReq({ merchant: 'UNKNOWN' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/merchant_mappings/)
  })

  it('returns 400 when merchant classification is not Subscription', async () => {
    db.mapping = { classification: 'Not a subscription' }
    const res = await PUT(putReq({ merchant: 'MYER' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/not classified/)
  })

  it('returns 400 when merchant_mappings classification is null', async () => {
    db.mapping = { classification: null }
    const res = await PUT(putReq({ merchant: 'WOOLWORTHS' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/not classified/)
  })

  it('upserts and returns 200 for a confirmed merchant', async () => {
    db.mapping = { classification: 'Subscription' }
    db.metadata = null
    const res = await PUT(putReq({
      merchant: 'NETFLIX',
      cancellation_url: 'https://netflix.com/cancel',
      account_email: 'user@test.com',
      auto_renews: true,
    }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.merchant).toBe('NETFLIX')
    expect(body.cancellation_url).toBe('https://netflix.com/cancel')
  })

  it('preserves created_at from existing row on update', async () => {
    db.mapping = { classification: 'Subscription' }
    db.metadata = {
      merchant: 'NETFLIX',
      household_id: 'hh-1',
      cancellation_url: null,
      account_email: null,
      notes: null,
      auto_renews: true,
      next_renewal_override: null,
      category: null,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-06-01T00:00:00Z',
    }
    const res = await PUT(putReq({ merchant: 'NETFLIX', notes: 'Updated note' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.created_at).toBe('2025-01-01T00:00:00Z')
  })

  it('returns 400 for non-boolean auto_renews', async () => {
    db.mapping = { classification: 'Subscription' }
    const res = await PUT(putReq({ merchant: 'NETFLIX', auto_renews: 'yes' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/auto_renews/)
  })

  it('returns 400 for an invalid next_renewal_override date', async () => {
    db.mapping = { classification: 'Subscription' }
    const res = await PUT(putReq({ merchant: 'NETFLIX', next_renewal_override: 'not-a-date' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/next_renewal_override/)
  })

  it('accepts null next_renewal_override (clearing the override)', async () => {
    db.mapping = { classification: 'Subscription' }
    db.metadata = null
    const res = await PUT(putReq({ merchant: 'NETFLIX', next_renewal_override: null }))
    expect(res.status).toBe(200)
  })

  it('returns 500 on upsert database error', async () => {
    db.mapping = { classification: 'Subscription' }
    db.metadata = null
    db.upsertError = 'constraint violation'
    const res = await PUT(putReq({ merchant: 'NETFLIX' }))
    expect(res.status).toBe(500)
    db.upsertError = null
  })

  it('returns 400 for invalid JSON body', async () => {
    const res = await PUT(
      new NextRequest('http://localhost/api/subscriptions/metadata', {
        method: 'PUT',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/JSON/)
  })
})
