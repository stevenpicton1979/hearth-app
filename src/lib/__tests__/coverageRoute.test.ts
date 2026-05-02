import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ── DB state shared across mock calls ────────────────────────────────────────
const db = vi.hoisted(() => ({
  rows: [] as Array<{
    merchant: string
    amount: number
    category: string | null
    matched_rule: string | null
    classification: string | null
    raw_description: string | null
    gl_account: string | null
    date: string
  }>,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from: () => {
      // self-referential chainable query — every filter method returns itself,
      // and it is thenable so `await query` resolves to the current db.rows
      const q: Record<string, unknown> = {}
      const noop = () => q
      q.select = noop
      q.eq    = noop
      q.gte   = noop
      q.lte   = noop
      q.not   = noop
      q.is    = noop
      q.then  = (resolve: (v: { data: typeof db.rows; error: null }) => void) =>
        resolve({ data: db.rows, error: null })
      return q
    },
  }),
}))

import { GET } from '@/app/api/dev/coverage/route'

// Minimal request helper
function req(qs = '') {
  return new NextRequest(`http://localhost/api/dev/coverage${qs ? `?${qs}` : ''}`)
}

describe('GET /api/dev/coverage', () => {
  it('returns grouped coverage rows for all merchants', async () => {
    db.rows = [
      { merchant: 'WOOLWORTHS', amount: -50, category: 'Groceries', matched_rule: null, classification: 'Joint', raw_description: 'WOOLWORTHS BAR', gl_account: null, date: '2024-01-10' },
      { merchant: 'WOOLWORTHS', amount: -30, category: 'Groceries', matched_rule: null, classification: 'Joint', raw_description: 'WOOLWORTHS ONL', gl_account: null, date: '2024-01-11' },
      { merchant: 'NETFLIX', amount: -22.99, category: null, matched_rule: 'merchant:netflix', classification: null, raw_description: 'NETFLIX.COM', gl_account: null, date: '2024-01-12' },
    ]

    const res = await GET(req())
    const data = await res.json()

    expect(data.rows).toHaveLength(2)
    const woolworths = data.rows.find((r: { merchant: string }) => r.merchant === 'WOOLWORTHS')
    expect(woolworths.count).toBe(2)
    expect(woolworths.totalValue).toBe(-80)
    expect(woolworths.matchStatus).toBe('unmatched')
  })

  it('filters to unmatched merchants when unmatched=true (legacy alias)', async () => {
    db.rows = [
      { merchant: 'WOOLWORTHS', amount: -50, category: 'Groceries', matched_rule: null, classification: null, raw_description: null, gl_account: null, date: '2024-01-10' },
      { merchant: 'NETFLIX', amount: -22.99, category: null, matched_rule: 'merchant:netflix', classification: null, raw_description: null, gl_account: null, date: '2024-01-12' },
    ]

    const res = await GET(req('unmatched=true'))
    const data = await res.json()

    expect(data.rows).toHaveLength(1)
    expect(data.rows[0].merchant).toBe('WOOLWORTHS')
    expect(data.rows[0].matchStatus).toBe('unmatched')
  })

  it('filters to unmatched merchants when status=unmatched', async () => {
    db.rows = [
      { merchant: 'WOOLWORTHS', amount: -50, category: 'Groceries', matched_rule: null, classification: null, raw_description: null, gl_account: null, date: '2024-01-10' },
      { merchant: 'NETFLIX', amount: -22.99, category: null, matched_rule: 'merchant:netflix', classification: null, raw_description: null, gl_account: null, date: '2024-01-12' },
    ]

    const res = await GET(req('status=unmatched'))
    const data = await res.json()

    expect(data.rows).toHaveLength(1)
    expect(data.rows[0].merchant).toBe('WOOLWORTHS')
  })

  it('filters to rule merchants when status=rule', async () => {
    db.rows = [
      { merchant: 'WOOLWORTHS', amount: -50, category: 'Groceries', matched_rule: null, classification: null, raw_description: null, gl_account: null, date: '2024-01-10' },
      { merchant: 'NETFLIX', amount: -22.99, category: null, matched_rule: 'merchant:netflix', classification: null, raw_description: null, gl_account: null, date: '2024-01-12' },
      { merchant: 'BHT PAY', amount: -500, category: null, matched_rule: null, classification: null, raw_description: null, gl_account: 'Wages & Salaries', date: '2024-01-13' },
    ]

    const res = await GET(req('status=rule'))
    const data = await res.json()

    expect(data.rows).toHaveLength(1)
    expect(data.rows[0].merchant).toBe('NETFLIX')
    expect(data.rows[0].matchStatus).toBe('rule')
  })

  it('filters to gl merchants when status=gl', async () => {
    db.rows = [
      { merchant: 'WOOLWORTHS', amount: -50, category: 'Groceries', matched_rule: null, classification: null, raw_description: null, gl_account: null, date: '2024-01-10' },
      { merchant: 'NETFLIX', amount: -22.99, category: null, matched_rule: 'merchant:netflix', classification: null, raw_description: null, gl_account: null, date: '2024-01-12' },
      { merchant: 'BHT PAY', amount: -500, category: null, matched_rule: null, classification: null, raw_description: null, gl_account: 'Wages & Salaries', date: '2024-01-13' },
    ]

    const res = await GET(req('status=gl'))
    const data = await res.json()

    expect(data.rows).toHaveLength(1)
    expect(data.rows[0].merchant).toBe('BHT PAY')
    expect(data.rows[0].matchStatus).toBe('gl')
  })

  it('returns transaction expansion rows when merchant= is provided', async () => {
    db.rows = [
      { merchant: 'NETFLIX', amount: -22.99, category: null, matched_rule: null, classification: null, raw_description: 'NETFLIX.COM', gl_account: null, date: '2024-01-12' },
    ]

    const res = await GET(req('merchant=NETFLIX'))
    const data = await res.json()

    expect(data.transactions).toHaveLength(1)
    expect(data.transactions[0]).toMatchObject({
      date: '2024-01-12',
      amount: -22.99,
      isIncome: false,
      rawDescription: 'NETFLIX.COM',
    })
    expect(data.rows).toBeUndefined()
  })

  it('returns empty rows array for empty DB result', async () => {
    db.rows = []

    const res = await GET(req())
    const data = await res.json()

    expect(data.rows).toEqual([])
  })
})
