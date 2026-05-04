import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── DB mock state ─────────────────────────────────────────────────────────────

const db = vi.hoisted(() => ({
  bhtRows: [] as Array<{
    id: string
    linked_transfer_id: string
    gl_account: string | null
    raw_description: string | null
  }>,
  updates: [] as Array<{ id: string; linked_gl_account: string | null; contact_name: string | null }>,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        // chain: .eq(household_id).eq(is_transfer).not(...).not(...)
        eq: () => ({
          eq: () => ({
            not: () => ({
              not: () => Promise.resolve({ data: db.bhtRows, error: null }),
            }),
          }),
        }),
      }),
      update: (vals: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          db.updates.push({
            id,
            linked_gl_account: vals.linked_gl_account as string | null,
            contact_name: vals.contact_name as string | null,
          })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  }),
}))

import { POST } from '@/app/api/admin/relink-transfers/route'

beforeEach(() => {
  db.bhtRows = []
  db.updates = []
})

describe('POST /api/admin/relink-transfers', () => {
  it('returns updated:0 when no BHT rows with gl_account exist', async () => {
    db.bhtRows = []
    const res = await POST()
    const body = await res.json()
    expect(body.updated).toBe(0)
  })

  it('propagates gl_account to the linked personal-side row', async () => {
    db.bhtRows = [
      { id: 'bht-1', linked_transfer_id: 'personal-1', gl_account: 'Wages Payable', raw_description: null },
    ]
    const res = await POST()
    const body = await res.json()
    expect(body.updated).toBe(1)
    const update = db.updates.find(u => u.id === 'personal-1')
    expect(update?.linked_gl_account).toBe('Wages Payable')
  })

  it('parses contact_name from raw_description first pipe-segment', async () => {
    db.bhtRows = [
      { id: 'bht-2', linked_transfer_id: 'personal-2', gl_account: 'Directors Loan', raw_description: 'Steven Picton | Mar 2026 | BHT' },
    ]
    await POST()
    const update = db.updates.find(u => u.id === 'personal-2')
    expect(update?.contact_name).toBe('Steven Picton')
  })

  it('sets contact_name to null when raw_description is null', async () => {
    db.bhtRows = [
      { id: 'bht-3', linked_transfer_id: 'personal-3', gl_account: 'Wages Payable', raw_description: null },
    ]
    await POST()
    const update = db.updates.find(u => u.id === 'personal-3')
    expect(update?.contact_name).toBeNull()
  })
})
