import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const db = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  selectError: null as string | null,
  lastFilters: {} as {
    eqs?: Array<[string, unknown]>
    gte?: [string, unknown]
    lte?: [string, unknown]
    or?: string
    range?: [number, number]
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from: () => {
      db.lastFilters = { eqs: [] }
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => { db.lastFilters.eqs!.push([col, val]); return chain },
        gte: (col: string, val: unknown) => { db.lastFilters.gte = [col, val]; return chain },
        lte: (col: string, val: unknown) => { db.lastFilters.lte = [col, val]; return chain },
        or: (clause: string) => { db.lastFilters.or = clause; return chain },
        order: () => chain,
        range: (a: number, b: number) => {
          db.lastFilters.range = [a, b]
          return Promise.resolve({
            data: db.selectError ? null : db.rows,
            error: db.selectError ? { message: db.selectError } : null,
          })
        },
      }
      return chain
    },
  }),
}))

import { GET } from '@/app/api/year-end/provisional/route'
import { fyForDate } from '@/lib/yearEnd'

function getReq(url: string) {
  return new NextRequest(url)
}

beforeEach(() => {
  db.rows = []
  db.selectError = null
  db.lastFilters = {}
})

describe('GET /api/year-end/provisional', () => {
  it('returns empty rows + zero summary when no draws in FY', async () => {
    db.rows = []
    const res = await GET(getReq('http://localhost/api/year-end/provisional?fy=2026'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fy).toBe(2026)
    expect(body.startDate).toBe('2025-07-01')
    expect(body.endDate).toBe('2026-06-30')
    expect(body.rows).toEqual([])
    expect(body.summary.totalDrawn).toBe(0)
    expect(body.summary.provisionalTotal).toBe(0)
    expect(body.summary.confirmedTotal).toBe(0)
    expect(body.summary.byClassification['director-income-steven']).toEqual({ count: 0, total: 0 })
  })

  it('defaults fy to current FY when omitted', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const expectedFy = fyForDate(today)
    const res = await GET(getReq('http://localhost/api/year-end/provisional'))
    const body = await res.json()
    expect(body.fy).toBe(expectedFy)
  })

  it('rejects nonsense fy values with 400', async () => {
    const res = await GET(getReq('http://localhost/api/year-end/provisional?fy=abc'))
    expect(res.status).toBe(400)
  })

  it('queries the FY date range and the Director-Drawings-or-year-end-rule clause', async () => {
    await GET(getReq('http://localhost/api/year-end/provisional?fy=2026'))
    expect(db.lastFilters.gte).toEqual(['date', '2025-07-01'])
    expect(db.lastFilters.lte).toEqual(['date', '2026-06-30'])
    expect(db.lastFilters.or).toBe('category.eq.Director Drawings,matched_rule.like.year-end:%')
    expect(db.lastFilters.range).toEqual([0, 999])
  })

  it('maps each row and computes classification from matched_rule', async () => {
    db.rows = [
      {
        id: 'tx-1', date: '2026-05-01', amount: 5000,
        contact_name: 'Picton', linked_gl_account: 'directors loan',
        is_provisional: true, matched_rule: 'merchant:bht_directors_loan_to_joint',
      },
      {
        id: 'tx-2', date: '2026-04-15', amount: 3000,
        contact_name: 'Picton', linked_gl_account: 'directors loan',
        is_provisional: false, matched_rule: 'year-end:director-income:steven',
      },
    ]
    const res = await GET(getReq('http://localhost/api/year-end/provisional?fy=2026'))
    const body = await res.json()
    expect(body.rows).toHaveLength(2)
    expect(body.rows[0].classification).toBeNull()
    expect(body.rows[1].classification).toBe('director-income-steven')
  })

  it('summary splits provisional vs confirmed and breaks down by classification', async () => {
    db.rows = [
      { id: 'a', date: '2026-05-01', amount: 5000, contact_name: null, linked_gl_account: null, is_provisional: true, matched_rule: 'merchant:bht_directors_loan_to_joint' },
      { id: 'b', date: '2026-04-01', amount: 3000, contact_name: null, linked_gl_account: null, is_provisional: false, matched_rule: 'year-end:director-income:steven' },
      { id: 'c', date: '2026-03-01', amount: 2000, contact_name: null, linked_gl_account: null, is_provisional: false, matched_rule: 'year-end:director-income:steven' },
      { id: 'd', date: '2026-02-01', amount: 1500, contact_name: null, linked_gl_account: null, is_provisional: false, matched_rule: 'year-end:wage:steven' },
    ]
    const res = await GET(getReq('http://localhost/api/year-end/provisional?fy=2026'))
    const body = await res.json()
    expect(body.summary.provisionalTotal).toBe(5000)
    expect(body.summary.confirmedTotal).toBe(6500)
    expect(body.summary.totalDrawn).toBe(11500)
    expect(body.summary.byClassification['director-income-steven']).toEqual({ count: 2, total: 5000 })
    expect(body.summary.byClassification['wage-steven']).toEqual({ count: 1, total: 1500 })
    expect(body.summary.byClassification['director-income-nicola']).toEqual({ count: 0, total: 0 })
  })

  it('returns 500 with error message on Supabase failure', async () => {
    db.selectError = 'connection refused'
    const res = await GET(getReq('http://localhost/api/year-end/provisional?fy=2026'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('connection refused')
  })
})
