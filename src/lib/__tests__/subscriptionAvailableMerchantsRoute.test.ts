import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── DB state ──────────────────────────────────────────────────────────────────

const db = vi.hoisted(() => ({
  linkedMerchants: [] as string[],
  dismissedMerchants: [] as string[],
  txMerchants: [] as string[],
  txError: null as string | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === 'subscription_merchants') {
        return {
          select: () => ({
            eq: () => Promise.resolve({
              data: db.linkedMerchants.map(m => ({ merchant: m })),
              error: null,
            }),
          }),
        }
      }

      if (table === 'merchant_mappings') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({
                data: db.dismissedMerchants.map(m => ({ merchant: m })),
                error: null,
              }),
            }),
          }),
        }
      }

      // transactions
      const chain: Record<string, unknown> = {}
      const noop = () => chain
      chain.select = noop
      chain.eq = noop
      chain.lt = noop
      chain.order = noop
      chain.limit = () => Promise.resolve({
        data: db.txMerchants.map(m => ({ merchant: m })),
        error: db.txError ? { message: db.txError } : null,
      })
      return chain
    },
  }),
}))

import { GET } from '@/app/api/subscriptions/available-merchants/route'

beforeEach(() => {
  db.linkedMerchants = []
  db.dismissedMerchants = []
  db.txMerchants = []
  db.txError = null
})

describe('GET /api/subscriptions/available-merchants', () => {
  it('returns all merchants when none are linked or dismissed', async () => {
    db.txMerchants = ['NETFLIX', 'SPOTIFY', 'GOOGLE']
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.merchants).toEqual(['GOOGLE', 'NETFLIX', 'SPOTIFY'])
  })

  it('excludes merchants already linked to a subscription', async () => {
    db.txMerchants = ['NETFLIX', 'SPOTIFY', 'GOOGLE']
    db.linkedMerchants = ['NETFLIX']
    const res = await GET()
    const body = await res.json()
    expect(body.merchants).toEqual(['GOOGLE', 'SPOTIFY'])
    expect(body.merchants).not.toContain('NETFLIX')
  })

  it('excludes dismissed merchants', async () => {
    db.txMerchants = ['NETFLIX', 'SPOTIFY', 'RANDOM_CHARGE']
    db.dismissedMerchants = ['RANDOM_CHARGE']
    const res = await GET()
    const body = await res.json()
    expect(body.merchants).toEqual(['NETFLIX', 'SPOTIFY'])
    expect(body.merchants).not.toContain('RANDOM_CHARGE')
  })

  it('excludes both linked and dismissed merchants', async () => {
    db.txMerchants = ['NETFLIX', 'SPOTIFY', 'GOOGLE', 'JUNK']
    db.linkedMerchants = ['NETFLIX']
    db.dismissedMerchants = ['JUNK']
    const res = await GET()
    const body = await res.json()
    expect(body.merchants).toEqual(['GOOGLE', 'SPOTIFY'])
  })

  it('returns merchants sorted alphabetically', async () => {
    db.txMerchants = ['ZOOM', 'ADOBE', 'MICROSOFT', 'APPLE']
    const res = await GET()
    const body = await res.json()
    expect(body.merchants).toEqual(['ADOBE', 'APPLE', 'MICROSOFT', 'ZOOM'])
  })

  it('deduplicates merchants that appear in multiple transactions', async () => {
    db.txMerchants = ['NETFLIX', 'NETFLIX', 'NETFLIX', 'SPOTIFY']
    const res = await GET()
    const body = await res.json()
    expect(body.merchants).toEqual(['NETFLIX', 'SPOTIFY'])
  })

  it('returns empty array when all merchants are linked or dismissed', async () => {
    db.txMerchants = ['NETFLIX', 'SPOTIFY']
    db.linkedMerchants = ['NETFLIX']
    db.dismissedMerchants = ['SPOTIFY']
    const res = await GET()
    const body = await res.json()
    expect(body.merchants).toEqual([])
  })

  it('returns 500 on transaction query error', async () => {
    db.txError = 'connection refused'
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('connection refused')
  })
})
