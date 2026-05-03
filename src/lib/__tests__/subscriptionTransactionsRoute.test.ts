import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

const db = vi.hoisted(() => ({
  rows: [] as Array<{
    date: string
    amount: number
    raw_description: string | null
    description: string | null
    merchant: string
    account_id: string
    category: string | null
    classification: string | null
    gl_account: string | null
    external_id: string | null
    accounts: { display_name: string } | null
  }>,
  error: null as string | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {}
      const noop = () => q
      q.select = noop
      q.eq    = noop
      q.order = noop
      q.then  = (resolve: (v: { data: typeof db.rows; error: { message: string } | null }) => void) =>
        resolve({ data: db.rows, error: db.error ? { message: db.error } : null })
      return q
    },
  }),
}))

import { GET } from '@/app/api/subscriptions/transactions/route'

function req(qs = '') {
  return new NextRequest(`http://localhost/api/subscriptions/transactions${qs ? `?${qs}` : ''}`)
}

describe('GET /api/subscriptions/transactions', () => {
  it('returns 400 when merchant query param is missing', async () => {
    const res = await GET(req())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/merchant/)
  })

  it('returns empty transactions array when no rows found', async () => {
    db.rows = []
    const res = await GET(req('merchant=NOBODY'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.transactions).toEqual([])
  })

  it('returns transactions with expected fields', async () => {
    db.rows = [
      {
        date: '2026-04-01',
        amount: -15.99,
        raw_description: 'NETFLIX.COM AU',
        description: 'NETFLIX',
        merchant: 'NETFLIX',
        account_id: 'acct-1',
        category: 'Entertainment',
        classification: 'Personal',
        gl_account: null,
        external_id: null,
        accounts: { display_name: 'Visa Debit' },
      },
    ]
    const res = await GET(req('merchant=NETFLIX'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.transactions).toHaveLength(1)
    const tx = body.transactions[0]
    expect(tx.date).toBe('2026-04-01')
    expect(tx.amount).toBe(-15.99)
    expect(tx.raw_description).toBe('NETFLIX.COM AU')
    expect(tx.account_name).toBe('Visa Debit')
    expect(tx.merchant).toBe('NETFLIX')
  })

  it('maps null accounts relation to null account_name', async () => {
    db.rows = [
      {
        date: '2026-04-01',
        amount: -9.99,
        raw_description: 'SPOTIFY',
        description: 'SPOTIFY',
        merchant: 'SPOTIFY',
        account_id: 'acct-2',
        category: null,
        classification: null,
        gl_account: null,
        external_id: null,
        accounts: null,
      },
    ]
    const res = await GET(req('merchant=SPOTIFY'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.transactions[0].account_name).toBeNull()
  })

  it('returns 500 on database error', async () => {
    db.rows = []
    db.error = 'connection refused'
    const res = await GET(req('merchant=NETFLIX'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('connection refused')
    db.error = null
  })

  it('returns multiple transactions preserving order from DB', async () => {
    db.rows = [
      { date: '2026-04-01', amount: -15.99, raw_description: 'A', description: 'NETFLIX', merchant: 'NETFLIX', account_id: 'acct-1', category: null, classification: null, gl_account: null, external_id: null, accounts: null },
      { date: '2026-03-01', amount: -15.99, raw_description: 'B', description: 'NETFLIX', merchant: 'NETFLIX', account_id: 'acct-1', category: null, classification: null, gl_account: null, external_id: null, accounts: null },
    ]
    const res = await GET(req('merchant=NETFLIX'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.transactions).toHaveLength(2)
    expect(body.transactions[0].date).toBe('2026-04-01')
    expect(body.transactions[1].date).toBe('2026-03-01')
  })
})
