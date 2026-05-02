import { describe, it, expect, vi } from 'vitest'

// ── DB state shared across mock calls ────────────────────────────────────────
const db = vi.hoisted(() => ({
  accounts: [] as Array<{ id: string; display_name: string }>,
  // keyed by account_id, value is array of date strings
  xeroDatesByAccount: {} as Record<string, string[]>,
  allExternalIds: [] as string[],
  csvRows: [] as Array<{ merchant: string; amount: number; date: string }>,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === 'accounts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: db.accounts, error: null }),
            }),
          }),
        }
      }

      // transactions table — differentiate by the select fields and filter chain
      return {
        // per-account Xero date fetch
        select: (cols: string) => {
          if (cols === 'date') {
            // chain: .eq(household_id).eq(account_id).not(external_id)
            // source filter removed — external_id IS NOT NULL is the correct Xero discriminator
            return {
              eq: () => ({
                eq: (_col: string, accountId: string) => ({
                  not: () => Promise.resolve({
                    data: (db.xeroDatesByAccount[accountId] ?? []).map(d => ({ date: d })),
                    error: null,
                  }),
                }),
              }),
            }
          }
          if (cols === 'external_id') {
            return {
              eq: () => ({
                not: () => Promise.resolve({
                  data: db.allExternalIds.map(id => ({ external_id: id })),
                  error: null,
                }),
              }),
            }
          }
          if (cols === 'merchant, amount, date') {
            return {
              eq: () => ({
                eq: () => ({
                  is: () => Promise.resolve({ data: db.csvRows, error: null }),
                }),
              }),
            }
          }
          return { eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }
        },
      }
    },
  }),
}))

import { GET } from '@/app/api/admin/reconcile/route'

describe('GET /api/admin/reconcile', () => {
  it('returns clean result when no issues exist', async () => {
    db.accounts = [{ id: 'acct-1', display_name: 'Business Cheque' }]
    db.xeroDatesByAccount = {
      'acct-1': ['2024-01-10', '2024-02-15', '2024-03-20'],
    }
    db.allExternalIds = ['ext-1', 'ext-2', 'ext-3']
    db.csvRows = []

    const res = await GET()
    const data = await res.json()

    expect(data.accounts).toHaveLength(1)
    expect(data.accounts[0].name).toBe('Business Cheque')
    expect(data.accounts[0].dbCount).toBe(3)
    expect(data.accounts[0].gapMonths).toEqual([])
    expect(data.externalIdDuplicates).toEqual([])
    expect(data.csvNearDuplicates).toEqual([])
  })

  it('reports gap months when a calendar month has no transactions', async () => {
    db.accounts = [{ id: 'acct-1', display_name: 'Business Cheque' }]
    db.xeroDatesByAccount = {
      'acct-1': ['2024-01-10', /* no Feb */ '2024-03-20'],
    }
    db.allExternalIds = ['ext-1']
    db.csvRows = []

    const res = await GET()
    const data = await res.json()

    expect(data.accounts[0].gapMonths).toEqual(['2024-02'])
  })

  it('reports external-id duplicates', async () => {
    db.accounts = []
    db.xeroDatesByAccount = {}
    db.allExternalIds = ['ext-1', 'ext-2', 'ext-1']  // ext-1 appears twice
    db.csvRows = []

    const res = await GET()
    const data = await res.json()

    expect(data.externalIdDuplicates).toContain('ext-1')
  })

  it('reports CSV near-duplicates', async () => {
    db.accounts = []
    db.xeroDatesByAccount = {}
    db.allExternalIds = []
    db.csvRows = [
      { merchant: 'WOOLWORTHS', amount: 50, date: '2024-01-10' },
      { merchant: 'WOOLWORTHS', amount: 50, date: '2024-01-10' },
    ]

    const res = await GET()
    const data = await res.json()

    expect(data.csvNearDuplicates).toHaveLength(1)
    expect(data.csvNearDuplicates[0]).toMatchObject({ merchant: 'WOOLWORTHS', count: 2 })
  })
})
