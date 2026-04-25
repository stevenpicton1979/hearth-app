import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Supabase — must be hoisted so the import of salaryLinker sees the mock
// ---------------------------------------------------------------------------
const mockFrom = vi.fn()

vi.mock('../supabase/server', () => ({
  createServerClient: () => ({
    from: mockFrom,
  }),
}))

// Fluent builder returned for the SELECT query
function makeSelectBuilder(rows: unknown[]) {
  const b: Record<string, unknown> = {}
  b.select = vi.fn().mockReturnValue(b)
  b.eq = vi.fn().mockReturnValue(b)
  b.in = vi.fn().mockReturnValue(b)
  b.is = vi.fn().mockResolvedValue({ data: rows, error: null })
  return b
}

import { linkSalaryPairs } from '../salaryLinker'

describe('linkSalaryPairs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 0 when dates array is empty', async () => {
    const count = await linkSalaryPairs([])
    expect(count).toBe(0)
  })

  it('returns 0 when no salary transactions exist', async () => {
    mockFrom.mockReturnValue(makeSelectBuilder([]))
    const count = await linkSalaryPairs(['2025-08-11'])
    expect(count).toBe(0)
  })

  it('links a matching Xero debit + CBA credit on the same date', async () => {
    const xeroDebit = { id: 'xero-1', account_id: 'bht-acc', date: '2025-08-11', amount: -4000, category: 'Salary' }
    const cbaCredit = { id: 'cba-1', account_id: 'bills-acc', date: '2025-08-11', amount: 4000, category: 'Salary' }

    const updates: { id: string; linked_transfer_id: string }[] = []

    mockFrom.mockImplementation((table: string) => {
      if (table === 'transactions') {
        let callCount = 0
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({ data: [xeroDebit, cbaCredit], error: null }),
          update: vi.fn().mockImplementation((data: { linked_transfer_id: string }) => ({
            eq: vi.fn().mockImplementation((_field: string, id: string) => {
              if (callCount === 0) updates.push({ id, linked_transfer_id: data.linked_transfer_id })
              callCount++
              return Promise.resolve({ error: null })
            }),
          })),
        }
      }
      return {}
    })

    const count = await linkSalaryPairs(['2025-08-11'])
    expect(count).toBe(1)
  })

  it('does not link transactions on different dates', async () => {
    const xeroDebit = { id: 'xero-1', account_id: 'bht-acc', date: '2025-08-11', amount: -4000, category: 'Salary' }
    const cbaCredit = { id: 'cba-1', account_id: 'bills-acc', date: '2025-09-11', amount: 4000, category: 'Salary' }

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: [xeroDebit, cbaCredit], error: null }),
    })

    const count = await linkSalaryPairs(['2025-08-11', '2025-09-11'])
    expect(count).toBe(0)
  })

  it('does not link transactions with mismatched amounts', async () => {
    const xeroDebit = { id: 'xero-1', account_id: 'bht-acc', date: '2025-08-11', amount: -4000, category: 'Salary' }
    const cbaCredit = { id: 'cba-1', account_id: 'bills-acc', date: '2025-08-11', amount: 3500, category: 'Salary' }

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: [xeroDebit, cbaCredit], error: null }),
    })

    const count = await linkSalaryPairs(['2025-08-11'])
    expect(count).toBe(0)
  })

  it('does not link two transactions in the same account', async () => {
    const tx1 = { id: 'tx-1', account_id: 'same-acc', date: '2025-08-11', amount: -4000, category: 'Salary' }
    const tx2 = { id: 'tx-2', account_id: 'same-acc', date: '2025-08-11', amount: 4000, category: 'Salary' }

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: [tx1, tx2], error: null }),
    })

    const count = await linkSalaryPairs(['2025-08-11'])
    expect(count).toBe(0)
  })

  it('returns 0 when no rows returned from DB', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: null, error: null }),
    })

    const count = await linkSalaryPairs(['2025-08-11'])
    expect(count).toBe(0)
  })

  it('links two separate salary pairs on the same date', async () => {
    const rows = [
      { id: 'xero-1', account_id: 'bht',      date: '2025-08-11', amount: -4000, category: 'Salary' },
      { id: 'cba-1',  account_id: 'bills',     date: '2025-08-11', amount:  4000, category: 'Salary' },
      { id: 'xero-2', account_id: 'bht',       date: '2025-08-11', amount: -3500, category: 'Salary' },
      { id: 'cba-2',  account_id: 'personal',  date: '2025-08-11', amount:  3500, category: 'Salary' },
    ]

    const updatedIds: string[] = []

    mockFrom.mockImplementation((table: string) => {
      if (table === 'transactions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({ data: rows, error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_field: string, id: string) => {
              updatedIds.push(id)
              return Promise.resolve({ error: null })
            }),
          }),
        }
      }
      return {}
    })

    const count = await linkSalaryPairs(['2025-08-11'])
    expect(count).toBe(2)             // 2 pairs linked
    expect(updatedIds).toHaveLength(4) // 4 update calls (both sides of each pair)
  })

  it('does not re-link rows that already have linked_transfer_id set', async () => {
    // The DB query filters on IS NULL, so the mock returns only unlinked rows.
    // If all rows are already linked the mock returns [] and count should be 0.
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: [], error: null }),
    })

    const count = await linkSalaryPairs(['2025-08-11'])
    expect(count).toBe(0)
  })

})
