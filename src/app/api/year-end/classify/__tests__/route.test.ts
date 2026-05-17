import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const db = vi.hoisted(() => ({
  updateCalls: [] as Array<{
    changes: Record<string, unknown>
    eqs: Array<[string, unknown]>
    inIds: string[] | null
  }>,
  updateError: null as string | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from: () => ({
      update: (changes: Record<string, unknown>) => {
        const call: typeof db.updateCalls[number] = { changes, eqs: [], inIds: null }
        db.updateCalls.push(call)
        const chain = {
          eq: (col: string, val: unknown) => { call.eqs.push([col, val]); return chain },
          in: (col: string, ids: string[]) => {
            call.inIds = ids
            return Promise.resolve({ error: db.updateError ? { message: db.updateError } : null })
          },
        }
        return chain
      },
    }),
  }),
}))

import { POST } from '@/app/api/year-end/classify/route'

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/year-end/classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  db.updateCalls = []
  db.updateError = null
})

describe('POST /api/year-end/classify — validation', () => {
  it('returns 400 on invalid JSON', async () => {
    const res = await POST(postReq('not-json'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when ids is missing', async () => {
    const res = await POST(postReq({ classification: 'wage-steven' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/ids/i)
  })

  it('returns 400 when ids is empty', async () => {
    const res = await POST(postReq({ ids: [], classification: 'wage-steven' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when ids contains non-strings', async () => {
    const res = await POST(postReq({ ids: ['tx-1', 42], classification: 'wage-steven' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when classification is missing', async () => {
    const res = await POST(postReq({ ids: ['tx-1'] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when classification is unknown', async () => {
    const res = await POST(postReq({ ids: ['tx-1'], classification: 'not-a-thing' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/unknown/i)
  })
})

describe('POST /api/year-end/classify — payloads', () => {
  it('director-income-steven applies the expected fields', async () => {
    const res = await POST(postReq({ ids: ['tx-1'], classification: 'director-income-steven' }))
    expect(res.status).toBe(200)
    expect(db.updateCalls).toHaveLength(1)
    expect(db.updateCalls[0].changes).toEqual({
      category: 'Director Income', owner: 'Steven', is_income: true,
      is_transfer: false, is_provisional: false,
      matched_rule: 'year-end:director-income:steven',
    })
    expect(db.updateCalls[0].inIds).toEqual(['tx-1'])
  })

  it('director-income-nicola applies the expected fields', async () => {
    await POST(postReq({ ids: ['tx-1'], classification: 'director-income-nicola' }))
    expect(db.updateCalls[0].changes).toMatchObject({
      category: 'Director Income', owner: 'Nicola',
      matched_rule: 'year-end:director-income:nicola',
    })
  })

  it('wage-steven applies the expected fields', async () => {
    await POST(postReq({ ids: ['tx-1'], classification: 'wage-steven' }))
    expect(db.updateCalls[0].changes).toMatchObject({
      category: 'Salary', owner: 'Steven',
      matched_rule: 'year-end:wage:steven',
    })
  })

  it("directors-loan flags row as transfer with null category", async () => {
    await POST(postReq({ ids: ['tx-1'], classification: 'directors-loan' }))
    expect(db.updateCalls[0].changes).toMatchObject({
      category: null, owner: 'Joint', is_transfer: true,
      matched_rule: 'year-end:directors-loan',
    })
  })

  it('reimbursement flags row as transfer with null category', async () => {
    await POST(postReq({ ids: ['tx-1'], classification: 'reimbursement' }))
    expect(db.updateCalls[0].changes).toMatchObject({
      category: null, owner: 'Joint', is_transfer: true,
      matched_rule: 'year-end:reimbursement',
    })
  })

  it('revert restores Director Drawings provisional state', async () => {
    const res = await POST(postReq({ ids: ['tx-1'], classification: 'revert' }))
    expect(res.status).toBe(200)
    expect(db.updateCalls[0].changes).toEqual({
      category: 'Director Drawings', owner: 'Joint', is_income: null,
      is_transfer: false, is_provisional: true,
      matched_rule: 'merchant:bht_directors_loan_to_joint',
    })
    const body = await res.json()
    expect(body.classification).toBe('revert')
  })
})

describe('POST /api/year-end/classify — bulk + scoping', () => {
  it('updates all ids in a single atomic call and returns updated=N', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const res = await POST(postReq({ ids, classification: 'wage-steven' }))
    expect(res.status).toBe(200)
    expect(db.updateCalls).toHaveLength(1)
    expect(db.updateCalls[0].inIds).toEqual(ids)
    const body = await res.json()
    expect(body.updated).toBe(5)
    expect(body.classification).toBe('wage-steven')
  })

  it('scopes the update to DEFAULT_HOUSEHOLD_ID', async () => {
    await POST(postReq({ ids: ['tx-1'], classification: 'wage-steven' }))
    const householdEq = db.updateCalls[0].eqs.find(([col]) => col === 'household_id')
    expect(householdEq).toBeDefined()
    expect(householdEq![1]).toBe('00000000-0000-0000-0000-000000000001')
  })
})

describe('POST /api/year-end/classify — errors', () => {
  it('returns 500 with error message on Supabase failure', async () => {
    db.updateError = 'unique violation'
    const res = await POST(postReq({ ids: ['tx-1'], classification: 'wage-steven' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('unique violation')
  })
})
