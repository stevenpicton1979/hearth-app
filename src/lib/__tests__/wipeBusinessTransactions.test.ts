import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock data state setup
const db = vi.hoisted(() => ({
  accounts: [] as Array<{
    id: string
    display_name: string
    institution: string | null
    scope: string | null
  }>,
  transactions: [] as Array<{
    id: string
    household_id: string
    account_id: string
  }>,
  deletedIds: [] as string[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === 'accounts') {
        return {
          select: () => ({
            eq: () => ({
              or: () => Promise.resolve({ data: db.accounts, error: null }),
            }),
          }),
        }
      }

      // For transactions table
      return {
        select: () => ({
          eq: (col: string) => ({
            eq: (col2: string, val2: string) => ({
              range: () => Promise.resolve({
                data:
                  col === 'household_id' && col2 === 'account_id'
                    ? db.transactions.filter((tx) => tx.account_id === val2)
                    : db.transactions,
                error: null,
              }),
            }),
          }),
        }),
        delete: () => ({
          in: (col: string, ids: string[]) => {
            if (col === 'id') {
              db.deletedIds.push(...ids)
              const count = ids.length
              return Promise.resolve({ error: null, count })
            }
            return Promise.resolve({ error: null, count: 0 })
          },
        }),
      }
    },
  }),
}))

// Import the POST handler after mocking
import { POST } from '@/app/api/admin/wipe-business-transactions/route'

beforeEach(() => {
  db.accounts = []
  db.transactions = []
  db.deletedIds = []
})

describe('POST /api/admin/wipe-business-transactions', () => {
  describe('Dry-run mode (default)', () => {
    it('returns counts without deleting when confirm is not set', async () => {
      db.accounts = [
        { id: 'acc-1', display_name: 'Xero Account', institution: 'Xero', scope: null },
      ]
      db.transactions = [
        { id: 'tx-1', household_id: 'hh-1', account_id: 'acc-1' },
        { id: 'tx-2', household_id: 'hh-1', account_id: 'acc-1' },
        { id: 'tx-3', household_id: 'hh-1', account_id: 'acc-1' },
      ]

      const req = new NextRequest('http://localhost:3000/api/admin/wipe-business-transactions')
      const response = await POST(req)
      const data = await response.json()

      expect(data.dry_run).toBe(true)
      expect(data.total).toBe(3)
      expect(data.accounts).toHaveLength(1)
      expect(data.accounts[0].count).toBe(3)
      expect(db.deletedIds).toHaveLength(0)
    })

    it('returns empty arrays when no business accounts exist', async () => {
      db.accounts = []

      const req = new NextRequest('http://localhost:3000/api/admin/wipe-business-transactions')
      const response = await POST(req)
      const data = await response.json()

      expect(data.dry_run).toBe(true)
      expect(data.accounts).toEqual([])
      expect(data.total).toBe(0)
    })

    it('filters accounts: only shows those with count > 0', async () => {
      db.accounts = [
        { id: 'acc-1', display_name: 'Xero Account', institution: 'Xero', scope: null },
        { id: 'acc-2', display_name: 'Business Account', institution: null, scope: 'business' },
      ]
      db.transactions = [{ id: 'tx-1', household_id: 'hh-1', account_id: 'acc-1' }]

      const req = new NextRequest('http://localhost:3000/api/admin/wipe-business-transactions')
      const response = await POST(req)
      const data = await response.json()

      expect(data.dry_run).toBe(true)
      expect(data.accounts).toHaveLength(1)
      expect(data.accounts[0].id).toBe('acc-1')
    })
  })

  describe('Confirm mode (?confirm=true)', () => {
    it('deletes all transactions and returns actual count', async () => {
      db.accounts = [
        { id: 'acc-1', display_name: 'Xero Account', institution: 'Xero', scope: null },
      ]
      db.transactions = [
        { id: 'tx-1', household_id: 'hh-1', account_id: 'acc-1' },
        { id: 'tx-2', household_id: 'hh-1', account_id: 'acc-1' },
        { id: 'tx-3', household_id: 'hh-1', account_id: 'acc-1' },
      ]

      const req = new NextRequest(
        'http://localhost:3000/api/admin/wipe-business-transactions?confirm=true'
      )
      const response = await POST(req)
      const data = await response.json()

      expect(data.dry_run).toBe(false)
      expect(data.total).toBe(3)
      expect(data.accounts).toHaveLength(1)
      expect(data.accounts[0].count).toBe(3)
      expect(db.deletedIds).toHaveLength(3)
    })

    it('handles multiple accounts across chunks of 500', async () => {
      db.accounts = [
        { id: 'acc-1', display_name: 'Xero Account', institution: 'Xero', scope: null },
        { id: 'acc-2', display_name: 'Business Account', institution: null, scope: 'business' },
      ]

      // Create 750 transactions (will be split into chunks)
      const txs = Array.from({ length: 750 }, (_, i) => ({
        id: `tx-${i}`,
        household_id: 'hh-1',
        account_id: i < 400 ? 'acc-1' : 'acc-2',
      }))
      db.transactions = txs

      const req = new NextRequest(
        'http://localhost:3000/api/admin/wipe-business-transactions?confirm=true'
      )
      const response = await POST(req)
      const data = await response.json()

      expect(data.dry_run).toBe(false)
      expect(data.total).toBe(750)
      expect(data.accounts).toHaveLength(2)
      expect(db.deletedIds).toHaveLength(750)
    })

    it('returns empty accounts array when no transactions exist', async () => {
      db.accounts = [
        { id: 'acc-1', display_name: 'Xero Account', institution: 'Xero', scope: null },
      ]
      db.transactions = []

      const req = new NextRequest(
        'http://localhost:3000/api/admin/wipe-business-transactions?confirm=true'
      )
      const response = await POST(req)
      const data = await response.json()

      expect(data.dry_run).toBe(false)
      expect(data.total).toBe(0)
      expect(data.accounts).toEqual([])
      expect(db.deletedIds).toHaveLength(0)
    })

    it('filters accounts: only shows those with count > 0 after delete', async () => {
      db.accounts = [
        { id: 'acc-1', display_name: 'Xero Account', institution: 'Xero', scope: null },
        { id: 'acc-2', display_name: 'Business Account', institution: null, scope: 'business' },
      ]
      db.transactions = [{ id: 'tx-1', household_id: 'hh-1', account_id: 'acc-1' }]

      const req = new NextRequest(
        'http://localhost:3000/api/admin/wipe-business-transactions?confirm=true'
      )
      const response = await POST(req)
      const data = await response.json()

      expect(data.dry_run).toBe(false)
      expect(data.accounts).toHaveLength(1)
      expect(data.accounts[0].id).toBe('acc-1')
      expect(db.deletedIds).toHaveLength(1)
    })
  })

  describe('Account selection', () => {
    it('includes accounts where institution = "Xero"', async () => {
      db.accounts = [
        { id: 'acc-1', display_name: 'My Xero', institution: 'Xero', scope: null },
      ]
      db.transactions = [{ id: 'tx-1', household_id: 'hh-1', account_id: 'acc-1' }]

      const req = new NextRequest('http://localhost:3000/api/admin/wipe-business-transactions')
      const response = await POST(req)
      const data = await response.json()

      expect(data.accounts).toHaveLength(1)
      expect(data.accounts[0].id).toBe('acc-1')
    })

    it('includes accounts where scope = "business"', async () => {
      db.accounts = [
        { id: 'acc-2', display_name: 'Business Savings', institution: null, scope: 'business' },
      ]
      db.transactions = [{ id: 'tx-1', household_id: 'hh-1', account_id: 'acc-2' }]

      const req = new NextRequest('http://localhost:3000/api/admin/wipe-business-transactions')
      const response = await POST(req)
      const data = await response.json()

      expect(data.accounts).toHaveLength(1)
      expect(data.accounts[0].id).toBe('acc-2')
    })

    it('includes accounts matching either condition (institution OR scope)', async () => {
      db.accounts = [
        { id: 'acc-1', display_name: 'Xero Account', institution: 'Xero', scope: null },
        { id: 'acc-2', display_name: 'Business Scope', institution: null, scope: 'business' },
      ]
      db.transactions = [
        { id: 'tx-1', household_id: 'hh-1', account_id: 'acc-1' },
        { id: 'tx-2', household_id: 'hh-1', account_id: 'acc-2' },
      ]

      const req = new NextRequest('http://localhost:3000/api/admin/wipe-business-transactions')
      const response = await POST(req)
      const data = await response.json()

      expect(data.accounts).toHaveLength(2)
      expect(data.total).toBe(2)
    })
  })
})
