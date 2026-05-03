import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── DB / mock state ───────────────────────────────────────────────────────────

const db = vi.hoisted(() => ({
  accounts: [] as Array<{
    id: string
    display_name: string
    last_xero_sync_count: number | null
    last_xero_synced_at: string | null
  }>,
  // post-sync transaction count per account id
  postSyncCounts: {} as Record<string, number>,
}))

const mocks = vi.hoisted(() => ({
  wipeResult: { accounts: [] as Array<{ id: string; name: string; count: number }>, total: 0 },
  syncResult: { synced: 0, skipped: 0, backfilled: 0, errors: [] as string[] },
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
      // transactions — count query (select with head: true)
      return {
        select: () => ({
          eq: () => ({
            eq: (_col: string, accountId: string) => Promise.resolve({
              data: null,
              count: db.postSyncCounts[accountId] ?? 0,
              error: null,
            }),
          }),
        }),
      }
    },
  }),
}))

vi.mock('@/lib/businessTransactionsWipe', () => ({
  runBusinessTransactionsWipe: vi.fn(async () => mocks.wipeResult),
}))

vi.mock('@/lib/xeroSyncRunner', () => ({
  runXeroFullSync: vi.fn(async () => mocks.syncResult),
}))

import { POST } from '@/app/api/admin/wipe-and-resync/route'
import { runBusinessTransactionsWipe } from '@/lib/businessTransactionsWipe'
import { runXeroFullSync } from '@/lib/xeroSyncRunner'

function makeReq(confirmed: boolean) {
  const url = confirmed
    ? 'http://localhost/api/admin/wipe-and-resync?confirm=true'
    : 'http://localhost/api/admin/wipe-and-resync'
  return new NextRequest(url, { method: 'POST' })
}

beforeEach(() => {
  db.accounts = []
  db.postSyncCounts = {}
  mocks.wipeResult = { accounts: [], total: 0 }
  mocks.syncResult = { synced: 0, skipped: 0, backfilled: 0, errors: [] }
  vi.mocked(runBusinessTransactionsWipe).mockClear()
  vi.mocked(runXeroFullSync).mockClear()
})

// ── Dry-run (no ?confirm=true) ────────────────────────────────────────────────

describe('POST /api/admin/wipe-and-resync — dry-run', () => {
  it('returns dry_run:true with account preview; does not call sync', async () => {
    db.accounts = [{
      id: 'acct-1', display_name: 'BHT Cheque',
      last_xero_sync_count: 120, last_xero_synced_at: '2026-04-01T00:00:00Z',
    }]
    mocks.wipeResult = { accounts: [{ id: 'acct-1', name: 'BHT Cheque', count: 100 }], total: 100 }

    const res = await POST(makeReq(false))
    const body = await res.json()

    expect(body.dry_run).toBe(true)
    expect(body.pre_wipe_total).toBe(100)
    expect(body.accounts[0].pre_wipe_count).toBe(100)
    expect(body.accounts[0].last_xero_sync_count).toBe(120)
    expect(body.message).toMatch(/confirm=true/)
    expect(runXeroFullSync).not.toHaveBeenCalled()
  })

  it('calls runBusinessTransactionsWipe with dryRun=true', async () => {
    db.accounts = []
    await POST(makeReq(false))
    expect(runBusinessTransactionsWipe).toHaveBeenCalledWith(true)
  })
})

// ── Happy path ────────────────────────────────────────────────────────────────

describe('POST /api/admin/wipe-and-resync — confirmed, happy path', () => {
  it('returns ok:true when all accounts within 5% tolerance', async () => {
    db.accounts = [
      { id: 'acct-1', display_name: 'BHT Cheque', last_xero_sync_count: 100, last_xero_synced_at: null },
      { id: 'acct-2', display_name: 'BHT Credit', last_xero_sync_count: 50, last_xero_synced_at: null },
    ]
    mocks.wipeResult = {
      accounts: [
        { id: 'acct-1', name: 'BHT Cheque', count: 100 },
        { id: 'acct-2', name: 'BHT Credit', count: 50 },
      ],
      total: 150,
    }
    mocks.syncResult = { synced: 148, skipped: 2, backfilled: 0, errors: [] }
    db.postSyncCounts = { 'acct-1': 101, 'acct-2': 49 }  // within 5%

    const res = await POST(makeReq(true))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.pre_wipe_total).toBe(150)
    expect(body.post_sync_total).toBe(150)
    expect(body.accounts).toHaveLength(2)
    expect(body.accounts[0].status).toBe('ok')
    expect(body.accounts[1].status).toBe('ok')
    expect(body.sync_response.synced).toBe(148)
    expect(body.duration_ms).toBeGreaterThanOrEqual(0)
  })

  it('calls wipe with dryRun=false then calls sync', async () => {
    db.accounts = [{ id: 'acct-1', display_name: 'A', last_xero_sync_count: null, last_xero_synced_at: null }]
    mocks.wipeResult = { accounts: [{ id: 'acct-1', name: 'A', count: 5 }], total: 5 }
    db.postSyncCounts = { 'acct-1': 5 }

    await POST(makeReq(true))

    expect(runBusinessTransactionsWipe).toHaveBeenCalledWith(false)
    expect(runXeroFullSync).toHaveBeenCalled()
  })
})

// ── Per-account status classification ─────────────────────────────────────────

describe('POST /api/admin/wipe-and-resync — account status classification', () => {
  function setupSingleAccount(preWipeCount: number, postSyncCount: number) {
    db.accounts = [{ id: 'acct-1', display_name: 'Test', last_xero_sync_count: null, last_xero_synced_at: null }]
    mocks.wipeResult = { accounts: [{ id: 'acct-1', name: 'Test', count: preWipeCount }], total: preWipeCount }
    db.postSyncCounts = { 'acct-1': postSyncCount }
  }

  it('status ok when post-sync count within 5% of pre-wipe', async () => {
    setupSingleAccount(100, 102)
    const body = await POST(makeReq(true)).then(r => r.json())
    expect(body.accounts[0].status).toBe('ok')
    expect(body.ok).toBe(true)
  })

  it('status warn when post-sync count < 95% of pre-wipe', async () => {
    setupSingleAccount(100, 80)
    const body = await POST(makeReq(true)).then(r => r.json())
    expect(body.accounts[0].status).toBe('warn')
    expect(body.ok).toBe(false)
    expect(body.accounts[0].message).toMatch(/significant drop/i)
  })

  it('status info when post-sync count > 105% of pre-wipe', async () => {
    setupSingleAccount(100, 115)
    const body = await POST(makeReq(true)).then(r => r.json())
    expect(body.accounts[0].status).toBe('info')
    expect(body.ok).toBe(true)
    expect(body.accounts[0].message).toMatch(/significant gain/i)
  })

  it('status error when post-sync count is 0 but pre-wipe was > 0', async () => {
    setupSingleAccount(100, 0)
    const body = await POST(makeReq(true)).then(r => r.json())
    expect(body.accounts[0].status).toBe('error')
    expect(body.ok).toBe(false)
    expect(body.accounts[0].message).toMatch(/sync failed/i)
  })

  it('status ok when both pre-wipe and post-sync are 0 (account was already empty)', async () => {
    setupSingleAccount(0, 0)
    const body = await POST(makeReq(true)).then(r => r.json())
    expect(body.accounts[0].status).toBe('ok')
    expect(body.ok).toBe(true)
  })
})

// ── Sync error path ───────────────────────────────────────────────────────────

describe('POST /api/admin/wipe-and-resync — sync error', () => {
  it('includes sync errors in response and sets ok:false', async () => {
    db.accounts = [{ id: 'acct-1', display_name: 'BHT', last_xero_sync_count: null, last_xero_synced_at: null }]
    mocks.wipeResult = { accounts: [{ id: 'acct-1', name: 'BHT', count: 50 }], total: 50 }
    mocks.syncResult = { synced: 0, skipped: 0, backfilled: 0, errors: ['Xero not connected'] }
    db.postSyncCounts = { 'acct-1': 0 }

    const res = await POST(makeReq(true))
    const body = await res.json()

    expect(body.ok).toBe(false)
    expect(body.sync_response.errors).toContain('Xero not connected')
    expect(body.accounts[0].status).toBe('error')
  })

  it('still reports pre/post counts even when sync returns errors', async () => {
    db.accounts = [{ id: 'acct-1', display_name: 'BHT', last_xero_sync_count: null, last_xero_synced_at: null }]
    mocks.wipeResult = { accounts: [{ id: 'acct-1', name: 'BHT', count: 75 }], total: 75 }
    mocks.syncResult = { synced: 30, skipped: 0, backfilled: 0, errors: ['Partial failure'] }
    db.postSyncCounts = { 'acct-1': 30 }

    const body = await POST(makeReq(true)).then(r => r.json())

    expect(body.accounts[0].pre_wipe_count).toBe(75)
    expect(body.accounts[0].post_sync_count).toBe(30)
    expect(body.sync_response.synced).toBe(30)
  })
})

// ── Response shape ────────────────────────────────────────────────────────────

describe('POST /api/admin/wipe-and-resync — response shape', () => {
  it('includes all required fields in the confirmed response', async () => {
    db.accounts = [{ id: 'acct-1', display_name: 'BHT Cheque', last_xero_sync_count: 55, last_xero_synced_at: '2026-04-30T00:00:00Z' }]
    mocks.wipeResult = { accounts: [{ id: 'acct-1', name: 'BHT Cheque', count: 55 }], total: 55 }
    mocks.syncResult = { synced: 55, skipped: 0, backfilled: 0, errors: [] }
    db.postSyncCounts = { 'acct-1': 55 }

    const body = await POST(makeReq(true)).then(r => r.json())

    expect(body).toMatchObject({
      ok: expect.any(Boolean),
      pre_wipe_total: expect.any(Number),
      post_sync_total: expect.any(Number),
      accounts: expect.any(Array),
      sync_response: {
        synced: expect.any(Number),
        skipped: expect.any(Number),
        errors: expect.any(Array),
      },
      duration_ms: expect.any(Number),
    })

    expect(body.accounts[0]).toMatchObject({
      id: 'acct-1',
      name: 'BHT Cheque',
      pre_wipe_count: 55,
      post_sync_count: 55,
      last_xero_sync_count: 55,
      status: 'ok',
    })
  })
})
