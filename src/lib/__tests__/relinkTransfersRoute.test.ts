import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Shared DB state ───────────────────────────────────────────────────────────

const db = vi.hoisted(() => ({
  dateRows: [] as Array<{ date: string }>,
  bhtRows: [] as Array<{
    id: string
    linked_transfer_id: string
    gl_account: string | null
    raw_description: string | null
  }>,
  updates: [] as Array<{ id: string; linked_gl_account: string | null; contact_name: string | null }>,
}))

// ── linkTransferPairs mock ────────────────────────────────────────────────────

const mockLinkTransferPairs = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ pairs: 0, glPropagated: 0, contactExtracted: 0 })
)

vi.mock('@/lib/transferLinker', () => ({
  linkTransferPairs: mockLinkTransferPairs,
}))

// ── Supabase mock ─────────────────────────────────────────────────────────────
// Distinguish the two select() calls by the fields string:
//   select('date')              → date deduplication query (Phase 1 prep)
//   select('id, ...')           → BHT rows query         (Phase 2)

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from: () => ({
      select: (fields: string) => {
        if (fields === 'date') {
          // Phase 1: .select('date').eq(household_id) → date rows
          return {
            eq: () => Promise.resolve({ data: db.dateRows, error: null }),
          }
        }
        // Phase 2: .select('id, ...').eq(household_id).not(...).not(...) → BHT rows
        return {
          eq: () => ({
            not: () => ({
              not: () => Promise.resolve({ data: db.bhtRows, error: null }),
            }),
          }),
        }
      },
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
  db.dateRows = []
  db.bhtRows = []
  db.updates = []
  mockLinkTransferPairs.mockClear()
  mockLinkTransferPairs.mockResolvedValue({ pairs: 0, glPropagated: 0, contactExtracted: 0 })
})

describe('POST /api/admin/relink-transfers', () => {
  it('returns all zeros when database is empty', async () => {
    const res = await POST()
    const body = await res.json()
    expect(body).toEqual({ linked_pairs: 0, gl_propagated: 0, contact_extracted: 0 })
  })

  it('calls linkTransferPairs with deduplicated dates from the DB', async () => {
    db.dateRows = [
      { date: '2025-06-01' },
      { date: '2025-06-01' }, // duplicate — should be deduped
      { date: '2025-06-02' },
    ]
    await POST()
    const calledDates = mockLinkTransferPairs.mock.calls[0][0] as string[]
    expect(calledDates).toHaveLength(2)
    expect(calledDates).toContain('2025-06-01')
    expect(calledDates).toContain('2025-06-02')
  })

  it('reflects pairs and metadata counts from linkTransferPairs in the response', async () => {
    db.dateRows = [{ date: '2025-06-01' }]
    mockLinkTransferPairs.mockResolvedValue({ pairs: 3, glPropagated: 2, contactExtracted: 1 })

    const res = await POST()
    const body = await res.json()
    expect(body.linked_pairs).toBe(3)
    expect(body.gl_propagated).toBeGreaterThanOrEqual(2)
    expect(body.contact_extracted).toBeGreaterThanOrEqual(1)
  })

  it('propagates gl_account to already-linked personal-side rows (phase 2)', async () => {
    db.bhtRows = [
      { id: 'bht-1', linked_transfer_id: 'personal-1', gl_account: 'Wages Payable', raw_description: null },
    ]
    await POST()
    const update = db.updates.find(u => u.id === 'personal-1')
    expect(update?.linked_gl_account).toBe('Wages Payable')
  })

  it('parses contact_name from raw_description for already-linked rows', async () => {
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
