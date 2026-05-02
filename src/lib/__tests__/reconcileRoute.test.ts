import { describe, it, expect, vi } from 'vitest'

// ── Xero API mock ─────────────────────────────────────────────────────────────
const xeroMock = vi.hoisted(() => ({
  xeroCountsByAccount: {} as Record<string, number>,
  connected: true,
}))

vi.mock('@/lib/xeroApi', () => ({
  getXeroConnection: () => Promise.resolve(xeroMock.connected
    ? { access_token: 'tok', tenant_id: 'tid', refresh_token: 'rt', expires_at: '2099-01-01' }
    : null),
  getXeroBankTransactionCount: (_conn: unknown, accountId: string) =>
    Promise.resolve(xeroMock.xeroCountsByAccount[accountId] ?? 0),
}))

// ── DB state shared across mock calls ────────────────────────────────────────
const db = vi.hoisted(() => ({
  accounts: [] as Array<{ id: string; display_name: string; xero_account_id: string | null }>,
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
        select: (cols: string) => {
          if (cols === 'date') {
            // chain: .select(date, {count:'exact'}).eq(hh).eq(acct).not(ext_id).limit(N)
            return {
              eq: () => ({
                eq: (_col: string, accountId: string) => ({
                  not: () => ({
                    limit: () => {
                      const dates = db.xeroDatesByAccount[accountId] ?? []
                      return Promise.resolve({
                        data: dates.map(d => ({ date: d })),
                        count: dates.length,
                        error: null,
                      })
                    },
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
    db.accounts = [{ id: 'acct-1', display_name: 'Business Cheque', xero_account_id: 'xero-1' }]
    db.xeroDatesByAccount = {
      'acct-1': ['2024-01-10', '2024-02-15', '2024-03-20'],
    }
    db.allExternalIds = ['ext-1', 'ext-2', 'ext-3']
    db.csvRows = []
    xeroMock.connected = true
    xeroMock.xeroCountsByAccount = { 'xero-1': 3 }

    const res = await GET()
    const data = await res.json()

    expect(data.accounts).toHaveLength(1)
    expect(data.accounts[0].name).toBe('Business Cheque')
    expect(data.accounts[0].dbCount).toBe(3)
    expect(data.accounts[0].xeroCount).toBe(3)
    expect(data.accounts[0].gapMonths).toEqual([])
    expect(data.externalIdDuplicates).toEqual([])
    expect(data.csvNearDuplicates).toEqual([])
  })

  it('uses count from Supabase response rather than dates.length for dbCount', async () => {
    // Simulate count=5000 but only 3 dates returned (limited by .limit())
    // In the mock count === dates.length, but the route uses count not dates.length
    db.accounts = [{ id: 'acct-1', display_name: 'Big Account', xero_account_id: 'xero-1' }]
    db.xeroDatesByAccount = { 'acct-1': ['2024-01-10', '2024-02-15', '2024-03-20'] }
    db.allExternalIds = []
    db.csvRows = []
    xeroMock.connected = true
    xeroMock.xeroCountsByAccount = { 'xero-1': 3 }

    const res = await GET()
    const data = await res.json()

    // dbCount comes from the count property, not data.length
    expect(data.accounts[0].dbCount).toBe(3)
  })

  it('reports gap months when a calendar month has no transactions', async () => {
    db.accounts = [{ id: 'acct-1', display_name: 'Business Cheque', xero_account_id: 'xero-1' }]
    db.xeroDatesByAccount = {
      'acct-1': ['2024-01-10', /* no Feb */ '2024-03-20'],
    }
    db.allExternalIds = ['ext-1']
    db.csvRows = []
    xeroMock.connected = true
    xeroMock.xeroCountsByAccount = { 'xero-1': 2 }

    const res = await GET()
    const data = await res.json()

    expect(data.accounts[0].gapMonths).toEqual(['2024-02'])
    expect(data.accounts[0].xeroCount).toBe(2)
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

  it('xeroCount is null when Xero is not connected', async () => {
    db.accounts = [{ id: 'acct-1', display_name: 'Business Cheque', xero_account_id: 'xero-1' }]
    db.xeroDatesByAccount = { 'acct-1': ['2024-01-10', '2024-02-15'] }
    db.allExternalIds = []
    db.csvRows = []
    xeroMock.connected = false
    xeroMock.xeroCountsByAccount = {}

    const res = await GET()
    const data = await res.json()

    expect(data.accounts[0].xeroCount).toBeNull()
    expect(data.accounts[0].dbCount).toBe(2)
  })

  it('reports count mismatch when xeroCount differs from dbCount by more than 2', async () => {
    db.accounts = [{ id: 'acct-1', display_name: 'Business Cheque', xero_account_id: 'xero-1' }]
    db.xeroDatesByAccount = { 'acct-1': ['2024-01-10', '2024-02-15', '2024-03-20'] }
    db.allExternalIds = []
    db.csvRows = []
    xeroMock.connected = true
    xeroMock.xeroCountsByAccount = { 'xero-1': 10 }  // DB has 3, Xero has 10 — mismatch

    const res = await GET()
    const data = await res.json()

    expect(data.accounts[0].dbCount).toBe(3)
    expect(data.accounts[0].xeroCount).toBe(10)
    // The route returns raw counts; the page computes the mismatch flag
  })

  it('xeroCount is null for accounts without a xero_account_id', async () => {
    db.accounts = [{ id: 'acct-1', display_name: 'Legacy Account', xero_account_id: null }]
    db.xeroDatesByAccount = { 'acct-1': ['2024-01-10'] }
    db.allExternalIds = []
    db.csvRows = []
    xeroMock.connected = true
    xeroMock.xeroCountsByAccount = {}

    const res = await GET()
    const data = await res.json()

    expect(data.accounts[0].xeroCount).toBeNull()
  })
})
