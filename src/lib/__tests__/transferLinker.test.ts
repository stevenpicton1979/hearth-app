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
    gl_account?: string | null
    raw_description?: string | null
  }>,
  updates: [] as Array<Record<string, unknown>>,
  capturedRanges: [] as Array<{ from: number; to: number }>,
  // When non-null, the mock returns pages[pageCallCount] on each .range() call
  // instead of db.rows. Set to null for single-page tests (default).
  pages: null as null | Array<typeof db.rows>,
  pageCallCount: 0,
}))

vi.mock('../supabase/server', () => ({
  createServerClient: () => ({
    from: () => ({
      // select chain: .select().eq().is().range()[.in()] -> { data: rows }
      // .range() returns a thenable (awaitable directly, no-dates path)
      // AND exposes .in() for the with-dates path.
      // When db.pages is set, returns successive pages on each call.
      select: () => ({
        eq: () => ({
          is: () => ({
            range: (from: number, to: number) => {
              db.capturedRanges.push({ from, to })
              const pageData = db.pages !== null
                ? (db.pages[db.pageCallCount++] ?? [])
                : db.rows
              const resolve = () => Promise.resolve({ data: pageData, error: null })
              return {
                in: () => resolve(),
                then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
                  resolve().then(onFulfilled, onRejected),
              }
            },
          }),
        }),
      }),
      // update chain: .update(vals).eq(col, id) -> records call, resolves {}
      update: (vals: Record<string, unknown>) => ({
        eq: (_: string, id: string) => {
          db.updates.push({ id, ...vals })
          return Promise.resolve({})
        },
      }),
    }),
  }),
}))

beforeEach(() => {
  db.rows = []
  db.updates = []
  db.capturedRanges = []
  db.pages = null
  db.pageCallCount = 0
})

describe('linkTransferPairs', () => {
  // 1. Happy path -- valid pair links (BHT side identified by gl_account)
  it('links two rows: same date, opposite amounts, different accounts, BHT side has gl_account', async () => {
    db.rows = [
      { id: 'tx-a', account_id: 'acc-1', date: '2025-06-01', amount: -500, is_transfer: true, gl_account: 'Directors Loan' },
      { id: 'tx-b', account_id: 'acc-2', date: '2025-06-01', amount: 500,  is_transfer: true, gl_account: null },
    ]
    const result = await linkTransferPairs(['2025-06-01'])
    expect(result.pairs).toBe(1)
  })

  // 2. Safety gate: neither side has gl_account → no pairing (prevents coincidental same-day same-amount matches)
  it('does NOT link when neither side has gl_account', async () => {
    db.rows = [
      { id: 'tx-a', account_id: 'acc-1', date: '2025-06-01', amount: -500, is_transfer: false, gl_account: null },
      { id: 'tx-b', account_id: 'acc-2', date: '2025-06-01', amount: 500,  is_transfer: false, gl_account: null },
    ]
    const result = await linkTransferPairs(['2025-06-01'])
    expect(result.pairs).toBe(0)
    expect(db.updates).toHaveLength(0)
  })

  // 3. Same account -- must not self-link
  it('does NOT link rows on the same account', async () => {
    db.rows = [
      { id: 'tx-a', account_id: 'acc-1', date: '2025-06-01', amount: -500, is_transfer: true, gl_account: 'Directors Loan' },
      { id: 'tx-b', account_id: 'acc-1', date: '2025-06-01', amount: 500,  is_transfer: true, gl_account: null },
    ]
    const result = await linkTransferPairs(['2025-06-01'])
    expect(result.pairs).toBe(0)
    expect(db.updates).toHaveLength(0)
  })

  // 4. Amounts don't cancel -- must not link
  it('does NOT link when amounts do not sum to zero', async () => {
    db.rows = [
      { id: 'tx-a', account_id: 'acc-1', date: '2025-06-01', amount: -500, is_transfer: true, gl_account: 'Directors Loan' },
      { id: 'tx-b', account_id: 'acc-2', date: '2025-06-01', amount: 400,  is_transfer: true, gl_account: null },
    ]
    const result = await linkTransferPairs(['2025-06-01'])
    expect(result.pairs).toBe(0)
    expect(db.updates).toHaveLength(0)
  })

  // 5. Different dates -- rows grouped by date so cross-date pairs are impossible
  it('does NOT link rows on different dates', async () => {
    db.rows = [
      { id: 'tx-a', account_id: 'acc-1', date: '2025-06-01', amount: -500, is_transfer: true, gl_account: 'Directors Loan' },
      { id: 'tx-b', account_id: 'acc-2', date: '2025-06-02', amount: 500,  is_transfer: true, gl_account: null },
    ]
    const result = await linkTransferPairs(['2025-06-01', '2025-06-02'])
    expect(result.pairs).toBe(0)
    expect(db.updates).toHaveLength(0)
  })

  // 6. Already-linked rows -- DB excludes them via .is('linked_transfer_id', null);
  //    also tests the in-run paired Set: once tx-a links to tx-b, it cannot
  //    link again to tx-c even though tx-c also matches.
  it('does NOT re-link a row already paired in the same run', async () => {
    db.rows = [
      { id: 'tx-a', account_id: 'acc-1', date: '2025-06-01', amount: -500, is_transfer: true, gl_account: 'Directors Loan' },
      { id: 'tx-b', account_id: 'acc-2', date: '2025-06-01', amount: 500,  is_transfer: true, gl_account: null },
      // tx-c also matches tx-a in amount/date, but tx-a is already paired
      { id: 'tx-c', account_id: 'acc-3', date: '2025-06-01', amount: 500,  is_transfer: true, gl_account: null },
    ]
    const result = await linkTransferPairs(['2025-06-01'])
    // Only one pair: tx-a <-> tx-b. tx-c stays unlinked.
    expect(result.pairs).toBe(1)
    expect(db.updates.find(u => u.id === 'tx-c')).toBeUndefined()
  })

  // 7. Bidirectionality -- both rows must point to each other
  it("links bidirectionally: both rows receive each other's id", async () => {
    db.rows = [
      { id: 'tx-a', account_id: 'acc-1', date: '2025-06-01', amount: -500, is_transfer: true, gl_account: 'Directors Loan' },
      { id: 'tx-b', account_id: 'acc-2', date: '2025-06-01', amount: 500,  is_transfer: true, gl_account: null },
    ]
    await linkTransferPairs(['2025-06-01'])

    const updateA = db.updates.find(u => u.id === 'tx-a')
    const updateB = db.updates.find(u => u.id === 'tx-b')
    expect(updateA?.linked_transfer_id).toBe('tx-b')
    expect(updateB?.linked_transfer_id).toBe('tx-a')
  })

  // 9. GL account propagation -- BHT side's gl_account propagates to personal side
  it('propagates gl_account from BHT side to personal-side linked_gl_account', async () => {
    db.rows = [
      // BHT side: has gl_account (Xero-synced), negative amount (debit from BHT)
      { id: 'tx-bht', account_id: 'acc-bht', date: '2025-06-01', amount: -4000, is_transfer: true, gl_account: 'Wages Payable', raw_description: null },
      // Personal side: no gl_account, positive amount (credit)
      { id: 'tx-personal', account_id: 'acc-personal', date: '2025-06-01', amount: 4000, is_transfer: true, gl_account: null, raw_description: null },
    ]
    await linkTransferPairs(['2025-06-01'])

    const personalUpdate = db.updates.find(u => u.id === 'tx-personal')
    expect(personalUpdate?.linked_gl_account).toBe('Wages Payable')
  })

  // 10. Contact name propagation -- parsed from BHT raw_description
  it('propagates contact_name (first pipe-segment of raw_description) to personal side', async () => {
    db.rows = [
      { id: 'tx-bht', account_id: 'acc-bht', date: '2025-06-01', amount: -4000, is_transfer: true, gl_account: 'Wages Payable', raw_description: 'Steven Picton | Mar 2026 | BHT' },
      { id: 'tx-personal', account_id: 'acc-personal', date: '2025-06-01', amount: 4000, is_transfer: true, gl_account: null, raw_description: null },
    ]
    await linkTransferPairs(['2025-06-01'])

    const personalUpdate = db.updates.find(u => u.id === 'tx-personal')
    expect(personalUpdate?.contact_name).toBe('Steven Picton')
  })

  // 11. BHT side does not receive linked_gl_account (propagation is one-way)
  it('does NOT set linked_gl_account on the BHT side itself', async () => {
    db.rows = [
      { id: 'tx-bht', account_id: 'acc-bht', date: '2025-06-01', amount: -4000, is_transfer: true, gl_account: 'Wages Payable', raw_description: 'Steven Picton | Mar 2026' },
      { id: 'tx-personal', account_id: 'acc-personal', date: '2025-06-01', amount: 4000, is_transfer: true, gl_account: null, raw_description: null },
    ]
    await linkTransferPairs(['2025-06-01'])

    const bhtUpdate = db.updates.find(u => u.id === 'tx-bht')
    expect(bhtUpdate?.linked_gl_account).toBeUndefined()
  })

  // 12. Wages Payable: BHT side is NOT flagged is_transfer (Payroll Expense classification)
  //     but has gl_account — must still pair and propagate to personal side.
  it('pairs BHT Wages Payable (is_transfer=false) with personal credit and propagates gl_account + contact_name', async () => {
    db.rows = [
      { id: 'tx-bht', account_id: 'acc-bht', date: '2025-06-01', amount: -4000, is_transfer: false, gl_account: 'Wages Payable', raw_description: 'Steven Picton | Mar 2026 | BHT' },
      { id: 'tx-personal', account_id: 'acc-personal', date: '2025-06-01', amount: 4000, is_transfer: false, gl_account: null, raw_description: null },
    ]
    const result = await linkTransferPairs(['2025-06-01'])

    expect(result.pairs).toBe(1)
    const personalUpdate = db.updates.find(u => u.id === 'tx-personal')
    expect(personalUpdate?.linked_gl_account).toBe('Wages Payable')
    expect(personalUpdate?.contact_name).toBe('Steven Picton')
  })

  // 13. Safety gate: two CSV-only rows (no gl_account) that cancel on the same day
  //     must NOT be paired even if they look like a transfer by amount.
  it('does NOT pair two rows where neither side has gl_account', async () => {
    db.rows = [
      { id: 'tx-x', account_id: 'acc-1', date: '2025-06-01', amount: -200, is_transfer: false, gl_account: null },
      { id: 'tx-y', account_id: 'acc-2', date: '2025-06-01', amount: 200,  is_transfer: false, gl_account: null },
    ]
    const result = await linkTransferPairs(['2025-06-01'])
    expect(result.pairs).toBe(0)
    expect(db.updates).toHaveLength(0)
  })

  // 8. Return value -- must equal the number of *pairs* (not individual rows)
  it('returns the correct count of pairs linked across multiple dates', async () => {
    db.rows = [
      { id: 'tx-a', account_id: 'acc-1', date: '2025-06-01', amount: -100, is_transfer: true, gl_account: 'Directors Loan' },
      { id: 'tx-b', account_id: 'acc-2', date: '2025-06-01', amount: 100,  is_transfer: true, gl_account: null },
      { id: 'tx-c', account_id: 'acc-1', date: '2025-06-02', amount: -200, is_transfer: true, gl_account: 'Directors Loan' },
      { id: 'tx-d', account_id: 'acc-2', date: '2025-06-02', amount: 200,  is_transfer: true, gl_account: null },
      { id: 'tx-e', account_id: 'acc-1', date: '2025-06-03', amount: -300, is_transfer: true, gl_account: 'Directors Loan' },
      { id: 'tx-f', account_id: 'acc-2', date: '2025-06-03', amount: 300,  is_transfer: true, gl_account: null },
    ]
    const result = await linkTransferPairs(['2025-06-01', '2025-06-02', '2025-06-03'])
    expect(result.pairs).toBe(3)
    // Sanity-check: 6 update calls total (2 per pair)
    expect(db.updates).toHaveLength(6)
  })

  // 14. Regression: must use .range(0, 999) for the first page (PAGE_SIZE=1000).
  it('paginates with range(0, 999) on the first call (PAGE_SIZE=1000)', async () => {
    db.rows = []
    await linkTransferPairs(['2025-06-01'])
    expect(db.capturedRanges[0]).toEqual({ from: 0, to: 999 })
  })

  // 15. No-argument call (full backfill): omitting dates fetches ALL unlinked rows.
  it('with no dates argument, pairs rows across the full household (no .in filter)', async () => {
    db.rows = [
      { id: 'tx-bht', account_id: 'acc-bht', date: '2025-06-01', amount: -4000, is_transfer: false, gl_account: 'Wages Payable', raw_description: null },
      { id: 'tx-personal', account_id: 'acc-personal', date: '2025-06-01', amount: 4000, is_transfer: false, gl_account: null, raw_description: null },
    ]
    const result = await linkTransferPairs()
    expect(result.pairs).toBe(1)
    expect(db.capturedRanges[0]).toEqual({ from: 0, to: 999 }) // first page starts at offset 0
  })

  // 16. Empty array means "no new dates this sync cycle" — return 0 without hitting the DB.
  it('with an empty dates array, returns 0 pairs without querying the DB', async () => {
    db.rows = [
      { id: 'tx-bht', account_id: 'acc-bht', date: '2025-06-01', amount: -4000, is_transfer: false, gl_account: 'Wages Payable', raw_description: null },
      { id: 'tx-personal', account_id: 'acc-personal', date: '2025-06-01', amount: 4000, is_transfer: false, gl_account: null, raw_description: null },
    ]
    const result = await linkTransferPairs([])
    expect(result.pairs).toBe(0)
    expect(db.capturedLimit).toBeUndefined() // DB never queried
  })

  // 17. Defensive guard: >500 dates would blow PostgREST URL length limit.
  it('throws when given more than 500 dates', async () => {
    const dates = Array.from({ length: 501 }, (_, i) => `2025-${String(Math.floor(i / 31) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`)
    await expect(linkTransferPairs(dates)).rejects.toThrow('dates array too large (>500)')
  })

  // 18. Pagination: rows spread across multiple pages are all assembled before pairing.
  //     Page 1 has 1000 rows (triggers a second fetch), page 2 has the pairable pair.
  it('assembles rows across multiple pages before pairing', async () => {
    // Page 1: 1000 same-account filler rows — none can pair with each other
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      id: `filler-${i}`,
      account_id: 'acc-same',
      date: '2025-06-01',
      amount: -(i + 1),
      is_transfer: false,
      gl_account: 'GL',
      raw_description: null,
    }))
    // Page 2: valid pair on a different date (proves cross-page assembly works)
    const page2 = [
      { id: 'tx-bht', account_id: 'acc-bht', date: '2025-06-02', amount: -4000, is_transfer: false, gl_account: 'Wages Payable', raw_description: null },
      { id: 'tx-personal', account_id: 'acc-personal', date: '2025-06-02', amount: 4000, is_transfer: false, gl_account: null, raw_description: null },
    ]
    // No empty sentinel needed — lastPageFull = false after page2 (2 < PAGE_SIZE)
    // so the loop exits without an extra fetch.
    db.pages = [page1, page2]

    const result = await linkTransferPairs()
    expect(result.pairs).toBe(1)                                   // pair found from page 2
    expect(db.pageCallCount).toBe(2)                               // 2 range() calls: page1, page2
    expect(db.capturedRanges[1]).toEqual({ from: 1000, to: 1999 }) // offset advanced correctly
  })
})
