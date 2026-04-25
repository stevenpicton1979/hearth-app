import { describe, it, expect, vi, beforeEach } from 'vitest'
import { linkTransferPairs } from '../transferLinker'

// vi.hoisted ensures this runs before module imports resolve,
// so the mock factory below can safely reference `db`.
const db = vi.hoisted(() => ({
  rows: [] as Array<{
    id: string
    account_id: string
    date: string
    amount: number
    is_transfer: boolean
  }>,
  updates: [] as Array<{ id: string; linked_transfer_id: string }>,
}))

vi.mock('../supabase/server', () => ({
  createServerClient: () => ({
    from: () => ({
      // select chain: .select().eq().in().is() -> { data: db.rows }
      select: () => ({
        eq: () => ({
          in: () => ({
            is: () => Promise.resolve({ data: db.rows }),
          }),
        }),
      }),
      // update chain: .update(vals).eq(col, id) -> records call, resolves {}
      update: (vals: Record<string, unknown>) => ({
        eq: (_: string, id: string) => {
          db.updates.push({
            id,
            linked_transfer_id: vals.linked_transfer_id as string,
          })
          return Promise.resolve({})
        },
      }),
    }),
  }),
}))

beforeEach(() => {
  db.rows = []
  db.updates = []
})

describe('linkTransferPairs', () => {
  // 1. Happy path -- valid pair links
  it('links two rows: same date, opposite amounts, different accounts, both is_transfer=true', async () => {
    db.rows = [
      { id: 'tx-a', account_id: 'acc-1', date: '2025-06-01', amount: -500, is_transfer: true },
      { id: 'tx-b', account_id: 'acc-2', date: '2025-06-01', amount: 500,  is_transfer: true },
    ]
    const count = await linkTransferPairs(['2025-06-01'])
    expect(count).toBe(1)
  })

  // 2. Regression: one-sided is_transfer flag must NOT produce a link (the ATO false-positive bug)
  it('does NOT link when only one side has is_transfer=true', async () => {
    db.rows = [
      { id: 'tx-a', account_id: 'acc-1', date: '2025-06-01', amount: -500, is_transfer: true  },
      { id: 'tx-b', account_id: 'acc-2', date: '2025-06-01', amount: 500,  is_transfer: false },
    ]
    const count = await linkTransferPairs(['2025-06-01'])
    expect(count).toBe(0)
    expect(db.updates).toHaveLength(0)
  })

  // 3. Same account -- must not self-link
  it('does NOT link rows on the same account', async () => {
    db.rows = [
      { id: 'tx-a', account_id: 'acc-1', date: '2025-06-01', amount: -500, is_transfer: true },
      { id: 'tx-b', account_id: 'acc-1', date: '2025-06-01', amount: 500,  is_transfer: true },
    ]
    const count = await linkTransferPairs(['2025-06-01'])
    expect(count).toBe(0)
    expect(db.updates).toHaveLength(0)
  })

  // 4. Amounts don't cancel -- must not link
  it('does NOT link when amounts do not sum to zero', async () => {
    db.rows = [
      { id: 'tx-a', account_id: 'acc-1', date: '2025-06-01', amount: -500, is_transfer: true },
      { id: 'tx-b', account_id: 'acc-2', date: '2025-06-01', amount: 400,  is_transfer: true },
    ]
    const count = await linkTransferPairs(['2025-06-01'])
    expect(count).toBe(0)
    expect(db.updates).toHaveLength(0)
  })

  // 5. Different dates -- rows grouped by date so cross-date pairs are impossible
  it('does NOT link rows on different dates', async () => {
    db.rows = [
      { id: 'tx-a', account_id: 'acc-1', date: '2025-06-01', amount: -500, is_transfer: true },
      { id: 'tx-b', account_id: 'acc-2', date: '2025-06-02', amount: 500,  is_transfer: true },
    ]
    const count = await linkTransferPairs(['2025-06-01', '2025-06-02'])
    expect(count).toBe(0)
    expect(db.updates).toHaveLength(0)
  })

  // 6. Already-linked rows -- DB excludes them via .is('linked_transfer_id', null);
  //    also tests the in-run paired Set: once tx-a links to tx-b, it cannot
  //    link again to tx-c even though tx-c also matches.
  it('does NOT re-link a row already paired in the same run', async () => {
    db.rows = [
      { id: 'tx-a', account_id: 'acc-1', date: '2025-06-01', amount: -500, is_transfer: true },
      { id: 'tx-b', account_id: 'acc-2', date: '2025-06-01', amount: 500,  is_transfer: true },
      // tx-c also matches tx-a in amount/date, but tx-a is already paired
      { id: 'tx-c', account_id: 'acc-3', date: '2025-06-01', amount: 500,  is_transfer: true },
    ]
    const count = await linkTransferPairs(['2025-06-01'])
    // Only one pair: tx-a <-> tx-b. tx-c stays unlinked.
    expect(count).toBe(1)
    expect(db.updates.find(u => u.id === 'tx-c')).toBeUndefined()
  })

  // 7. Bidirectionality -- both rows must point to each other
  it("links bidirectionally: both rows receive each other's id", async () => {
    db.rows = [
      { id: 'tx-a', account_id: 'acc-1', date: '2025-06-01', amount: -500, is_transfer: true },
      { id: 'tx-b', account_id: 'acc-2', date: '2025-06-01', amount: 500,  is_transfer: true },
    ]
    await linkTransferPairs(['2025-06-01'])

    const updateA = db.updates.find(u => u.id === 'tx-a')
    const updateB = db.updates.find(u => u.id === 'tx-b')
    expect(updateA?.linked_transfer_id).toBe('tx-b')
    expect(updateB?.linked_transfer_id).toBe('tx-a')
  })

  // 8. Return value -- must equal the number of *pairs* (not individual rows)
  it('returns the correct count of pairs linked across multiple dates', async () => {
    db.rows = [
      { id: 'tx-a', account_id: 'acc-1', date: '2025-06-01', amount: -100, is_transfer: true },
      { id: 'tx-b', account_id: 'acc-2', date: '2025-06-01', amount: 100,  is_transfer: true },
      { id: 'tx-c', account_id: 'acc-1', date: '2025-06-02', amount: -200, is_transfer: true },
      { id: 'tx-d', account_id: 'acc-2', date: '2025-06-02', amount: 200,  is_transfer: true },
      { id: 'tx-e', account_id: 'acc-1', date: '2025-06-03', amount: -300, is_transfer: true },
      { id: 'tx-f', account_id: 'acc-2', date: '2025-06-03', amount: 300,  is_transfer: true },
    ]
    const count = await linkTransferPairs(['2025-06-01', '2025-06-02', '2025-06-03'])
    expect(count).toBe(3)
    // Sanity-check: 6 update calls total (2 per pair)
    expect(db.updates).toHaveLength(6)
  })
})
