import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── DB state ──────────────────────────────────────────────────────────────────

const db = vi.hoisted(() => ({
  source: null as null | { id: string; name: string; notes: string | null },
  target: null as null | { id: string; notes: string | null },
  sourceLinks: [] as string[],
  targetLinks: [] as string[],
  insertedLinks: [] as Array<{ subscription_id: string; merchant: string; household_id: string }>,
  deletedSubId: null as string | null,
  updatedNotes: null as string | null,
  updateError: null as string | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => {
    let subCallCount = 0
    let merchantCallCount = 0

    return {
      from: (table: string) => {
        if (table === 'subscriptions') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => {
                    subCallCount++
                    if (subCallCount === 1) return Promise.resolve({ data: db.source, error: null })
                    return Promise.resolve({ data: db.target, error: null })
                  },
                }),
              }),
            }),
            update: (updates: Record<string, unknown>) => ({
              // Route: .update({...}).eq('id', target_id) — ONE eq only
              eq: () => {
                if (updates.notes !== undefined) db.updatedNotes = updates.notes as string | null
                return Promise.resolve({ error: db.updateError ? { message: db.updateError } : null })
              },
            }),
            delete: () => ({
              // Route: .delete().eq('id', source_id).eq('household_id', ...) — TWO eqs
              eq: (_col: string, val: string) => {
                db.deletedSubId = val
                return { eq: () => Promise.resolve({ error: null }) }
              },
            }),
          }
        }

        // subscription_merchants
        return {
          select: () => ({
            eq: () => {
              merchantCallCount++
              const links = merchantCallCount === 1 ? db.sourceLinks : db.targetLinks
              return Promise.resolve({
                data: links.map(m => ({ merchant: m })),
                error: null,
              })
            },
          }),
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
          insert: (rows: typeof db.insertedLinks) => {
            db.insertedLinks.push(...rows)
            return Promise.resolve({ error: null })
          },
        }
      },
    }
  },
}))

import { POST } from '@/app/api/subscriptions/merge/route'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/subscriptions/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  db.source = null
  db.target = null
  db.sourceLinks = []
  db.targetLinks = []
  db.insertedLinks = []
  db.deletedSubId = null
  db.updatedNotes = null
  db.updateError = null
})

describe('POST /api/subscriptions/merge', () => {
  it('returns 400 when body is missing both ids', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when source_id equals target_id', async () => {
    const res = await POST(req({ source_id: 'abc', target_id: 'abc' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/different/)
  })

  it('returns 404 when source subscription not found', async () => {
    db.source = null
    db.target = { id: 'tgt-1', notes: null }
    const res = await POST(req({ source_id: 'missing', target_id: 'tgt-1' }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/source/)
  })

  it('returns 404 when target subscription not found', async () => {
    db.source = { id: 'src-1', name: 'Source', notes: null }
    db.target = null
    const res = await POST(req({ source_id: 'src-1', target_id: 'missing' }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/target/)
  })

  it('happy path: returns ok and deletes source', async () => {
    db.source = { id: 'src-1', name: 'Source Sub', notes: null }
    db.target = { id: 'tgt-1', notes: null }
    db.sourceLinks = ['MERCHANT_A']
    db.targetLinks = ['MERCHANT_B']

    const res = await POST(req({ source_id: 'src-1', target_id: 'tgt-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(db.deletedSubId).toBe('src-1')
  })

  it('assigns source merchants to target, skipping duplicates already on target', async () => {
    db.source = { id: 'src-1', name: 'S', notes: null }
    db.target = { id: 'tgt-1', notes: null }
    db.sourceLinks = ['MERCHANT_A', 'MERCHANT_B']
    db.targetLinks = ['MERCHANT_B']  // MERCHANT_B already on target

    await POST(req({ source_id: 'src-1', target_id: 'tgt-1' }))

    const inserted = db.insertedLinks.map(l => l.merchant)
    expect(inserted).toContain('MERCHANT_A')
    expect(inserted).not.toContain('MERCHANT_B')  // already on target, skipped
  })

  it('appends source notes to target notes with "Merged from" prefix', async () => {
    db.source = { id: 'src-1', name: 'OldSub', notes: 'source note' }
    db.target = { id: 'tgt-1', notes: 'target note' }
    db.sourceLinks = ['MERCHANT_A']
    db.targetLinks = []

    await POST(req({ source_id: 'src-1', target_id: 'tgt-1' }))

    expect(db.updatedNotes).toContain('target note')
    expect(db.updatedNotes).toContain('Merged from OldSub')
    expect(db.updatedNotes).toContain('source note')
  })

  it('does not update notes when source has no notes', async () => {
    db.source = { id: 'src-1', name: 'S', notes: null }
    db.target = { id: 'tgt-1', notes: 'target note' }
    db.sourceLinks = ['MERCHANT_A']
    db.targetLinks = []

    await POST(req({ source_id: 'src-1', target_id: 'tgt-1' }))

    expect(db.updatedNotes).toBeNull()  // no update needed
  })

  it('returns 400 on invalid JSON', async () => {
    const badReq = new NextRequest('http://localhost/api/subscriptions/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const res = await POST(badReq)
    expect(res.status).toBe(400)
  })
})
