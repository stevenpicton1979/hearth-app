import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Supabase — hoisted so the import of categoryPipeline sees the mock
// ---------------------------------------------------------------------------
const mockFrom = vi.fn()

vi.mock('../supabase/server', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

import { processBatch, upsertTransactions, type RawTransaction, type ProcessedTransaction } from '../categoryPipeline'

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

let capturedUpsertRows: unknown[] = []

function setupMocks(opts: {
  mappings?: { merchant: string; category: string; classification: string | null }[]
  accounts?: { id: string; owner: string | null }[]
} = {}) {
  capturedUpsertRows = []
  const { mappings = [], accounts = [] } = opts

  mockFrom.mockImplementation((table: string) => {
    if (table === 'merchant_mappings') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: mappings, error: null }),
        upsert: vi.fn().mockImplementation((rows: unknown) => {
          capturedUpsertRows.push(rows)
          return Promise.resolve({ error: null })
        }),
      }
    }
    if (table === 'accounts') {
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: accounts, error: null }),
      }
    }
    return {}
  })
}

const ACCOUNT_ID = 'acc-001'

function raw(overrides: Partial<RawTransaction> = {}): RawTransaction {
  return {
    account_id: ACCOUNT_ID,
    date: '2025-08-11',
    amount: -50,
    description: 'WOOLWORTHS 1234',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('processBatch', () => {
  beforeEach(() => vi.clearAllMocks())

  // ── Zero amount ────────────────────────────────────────────────────────────

  it('skips zero-amount rows entirely', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([raw({ amount: 0 })])
    expect(toUpsert).toHaveLength(0)
  })

  // ── Regular debit categorisation ───────────────────────────────────────────

  it('auto-categorises a debit using guessCategory when no mapping exists', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([raw({ description: 'WOOLWORTHS 1234', amount: -50 })])
    expect(toUpsert).toHaveLength(1)
    expect(toUpsert[0].category).toBe('Food & Groceries')
    expect(toUpsert[0].is_transfer).toBe(false)
  })

  it('uses an existing merchant mapping over auto-category', async () => {
    setupMocks({
      // cleanMerchant('WOOLWORTHS 1234') → 'WOOLWORTHS 1234', so the mapping key
      // must match the post-clean merchant name exactly.
      mappings: [{ merchant: 'WOOLWORTHS 1234', category: 'Household', classification: 'Joint' }],
      accounts: [{ id: ACCOUNT_ID, owner: 'Steven' }],
    })
    const { toUpsert } = await processBatch([raw({ description: 'WOOLWORTHS 1234', amount: -50 })])
    expect(toUpsert[0].category).toBe('Household')
    expect(toUpsert[0].classification).toBe('Joint')
  })

  it('falls back to category_hint when no mapping and guessCategory returns null', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([
      raw({ description: 'UNKNOWN_CORP_XYZ_12345', amount: -99, category_hint: 'Business' }),
    ])
    expect(toUpsert[0].category).toBe('Business')
  })

  it('saves a new auto-mapping to merchant_mappings when guessCategory succeeds', async () => {
    setupMocks({ mappings: [] })
    await processBatch([raw({ description: 'WOOLWORTHS METRO', amount: -30 })])
    expect(capturedUpsertRows.length).toBeGreaterThan(0)
  })

  // ── Transfer detection ─────────────────────────────────────────────────────

  it('marks transfer pattern descriptions with is_transfer=true', async () => {
    setupMocks()
    const { toUpsert, transfersSkipped } = await processBatch([
      raw({ description: 'TRANSFER TO XX5426', amount: -1000 }),
    ])
    expect(toUpsert[0].is_transfer).toBe(true)
    expect(transfersSkipped).toBe(1)
  })

  it('forced_is_transfer=true marks a non-transfer description as a transfer', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([
      raw({ description: 'WOOLWORTHS 1234', amount: -50, forced_is_transfer: true }),
    ])
    expect(toUpsert[0].is_transfer).toBe(true)
  })

  it('forced_is_transfer=false overrides a transfer pattern description', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([
      raw({ description: 'TRANSFER TO XX5426', amount: -1000, forced_is_transfer: false }),
    ])
    expect(toUpsert[0].is_transfer).toBe(false)
  })

  it('transfer row carries a category_hint through', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([
      raw({ description: 'TRANSFER TO XX5426', amount: -1000, category_hint: 'Salary' }),
    ])
    expect(toUpsert[0].category).toBe('Salary')
    expect(toUpsert[0].is_transfer).toBe(true)
  })

  // ── Director income ────────────────────────────────────────────────────────

  it('classifies NETBANK WAGE credit as Salary, is_transfer=false', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([
      raw({ description: 'NETBANK WAGE CREDIT', amount: 4000 }),
    ])
    expect(toUpsert[0].category).toBe('Salary')
    expect(toUpsert[0].is_transfer).toBe(false)
  })

  it('classifies COMMBANK APP credit without wage keyword as Director Income', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([
      raw({ description: 'COMMBANK APP TRANSFER', amount: 2000 }),
    ])
    expect(toUpsert[0].category).toBe('Director Income')
    expect(toUpsert[0].is_transfer).toBe(false)
  })

  // ── Regular income (not director income) ──────────────────────────────────

  it('income credit that is not director income gets category=null', async () => {
    setupMocks({ accounts: [{ id: ACCOUNT_ID, owner: 'Steven' }] })
    const { toUpsert } = await processBatch([
      raw({ description: 'INTEREST PAYMENT', amount: 12.5 }),
    ])
    expect(toUpsert[0].category).toBeNull()
    expect(toUpsert[0].is_transfer).toBe(false)
    // classification comes from account owner
    expect(toUpsert[0].classification).toBe('Steven')
  })

  // ── Classification from account owner ─────────────────────────────────────

  it('sets classification from account owner when no merchant mapping overrides it', async () => {
    setupMocks({ accounts: [{ id: ACCOUNT_ID, owner: 'Nicola' }] })
    const { toUpsert } = await processBatch([raw({ amount: -50 })])
    expect(toUpsert[0].classification).toBe('Nicola')
  })

  it('classification stays null when account has no owner and no mapping', async () => {
    setupMocks({ accounts: [{ id: ACCOUNT_ID, owner: null }] })
    const { toUpsert } = await processBatch([raw({ amount: -50 })])
    expect(toUpsert[0].classification).toBeNull()
  })

  // ── Metadata passthrough ──────────────────────────────────────────────────

  it('passes needs_review=true through to the output row', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([raw({ needs_review: true })])
    expect(toUpsert[0].needs_review).toBe(true)
  })

  it('passes raw_description through to the output row', async () => {
    setupMocks()
    const rawDesc = '7-ELEVEN 4037 WISHART QLD | Caltex | Mastercard Bus. Plat'
    const { toUpsert } = await processBatch([raw({ raw_description: rawDesc })])
    expect(toUpsert[0].raw_description).toBe(rawDesc)
  })

  // ── Batch processing ──────────────────────────────────────────────────────

  it('processes multiple rows, skipping zero-amount ones', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([
      raw({ description: 'WOOLWORTHS 1234', amount: -50 }),
      raw({ description: 'UBER', amount: -15 }),
      raw({ amount: 0 }),
    ])
    expect(toUpsert).toHaveLength(2)
  })

  it('counts transfersSkipped correctly across a mixed batch', async () => {
    setupMocks()
    const { toUpsert, transfersSkipped } = await processBatch([
      raw({ description: 'WOOLWORTHS 1234', amount: -50 }),
      raw({ description: 'TRANSFER TO XX5426', amount: -1000 }),
      raw({ description: 'TRANSFER TO XX1234', amount: -500 }),
    ])
    expect(toUpsert).toHaveLength(3)
    expect(transfersSkipped).toBe(2)
  })

  // ── external_id passthrough ───────────────────────────────────────────────

  it('passes external_id through to the output row when provided', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([
      raw({ external_id: 'xero-uuid-abc123' }),
    ])
    expect(toUpsert[0].external_id).toBe('xero-uuid-abc123')
  })

  it('sets external_id to null when not provided', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([raw()])
    expect(toUpsert[0].external_id).toBeNull()
  })

  it('external_id is preserved through transfer branch', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([
      raw({ description: 'TRANSFER TO XX5426', amount: -1000, external_id: 'xero-transfer-999' }),
    ])
    expect(toUpsert[0].is_transfer).toBe(true)
    expect(toUpsert[0].external_id).toBe('xero-transfer-999')
  })
})

// ---------------------------------------------------------------------------
// upsertTransactions — external_id split + backfill logic
// ---------------------------------------------------------------------------

function makeProcessed(overrides: Partial<ProcessedTransaction> = {}): ProcessedTransaction {
  return {
    household_id: 'hh-1',
    account_id: 'acc-001',
    date: '2025-01-15',
    amount: -100,
    description: 'MERCHANT A',
    merchant: 'MERCHANT A',
    category: 'Business',
    classification: 'Steven',
    is_transfer: false,
    external_id: null,
    ...overrides,
  }
}

describe('upsertTransactions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rows WITH external_id upsert on external_id conflict', async () => {
    const capturedConflicts: string[] = []

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: [], error: null }),
      upsert: vi.fn().mockImplementation((_rows: unknown, opts: { onConflict?: string }) => {
        if (opts?.onConflict) capturedConflicts.push(opts.onConflict)
        return { select: vi.fn().mockResolvedValue({ data: [{ id: '1', category: 'Business' }], error: null }) }
      }),
    }))

    const rows = [makeProcessed({ external_id: 'xero-uuid-abc' })]
    await upsertTransactions(rows)
    expect(capturedConflicts).toContain('external_id')
    expect(capturedConflicts).not.toContain('account_id,date,amount,description')
  })

  it('rows WITHOUT external_id upsert on composite key', async () => {
    const capturedConflicts: string[] = []

    mockFrom.mockImplementation(() => ({
      upsert: vi.fn().mockImplementation((_rows: unknown, opts: { onConflict?: string }) => {
        if (opts?.onConflict) capturedConflicts.push(opts.onConflict)
        return { select: vi.fn().mockResolvedValue({ data: [{ id: '1', category: null }], error: null }) }
      }),
    }))

    const rows = [makeProcessed({ external_id: null })]
    await upsertTransactions(rows)
    expect(capturedConflicts).toContain('account_id,date,amount,description')
    expect(capturedConflicts).not.toContain('external_id')
  })

  it('mixed batch: rows are split by external_id presence', async () => {
    const capturedConflicts: string[] = []

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: [], error: null }),
      upsert: vi.fn().mockImplementation((_rows: unknown, opts: { onConflict?: string }) => {
        if (opts?.onConflict) capturedConflicts.push(opts.onConflict)
        return { select: vi.fn().mockResolvedValue({ data: [{ id: '1', category: null }], error: null }) }
      }),
    }))

    const rows = [
      makeProcessed({ external_id: 'xero-uuid-1' }),
      makeProcessed({ external_id: null, description: 'CSV IMPORT', merchant: 'CSV IMPORT' }),
    ]
    await upsertTransactions(rows)
    expect(capturedConflicts).toContain('external_id')
    expect(capturedConflicts).toContain('account_id,date,amount,description')
  })

  it('backfill: stamps an existing null-external_id row before upserting', async () => {
    const updatedIds: string[] = []

    mockFrom.mockImplementation((table: string) => {
      if (table === 'transactions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({
            data: [{ id: 'existing-row-id', date: '2025-01-15', amount: -100, external_id: null }],
            error: null,
          }),
          update: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockImplementation((_col: string, id: string) => {
              updatedIds.push(id)
              return Promise.resolve({ error: null })
            }),
          })),
          upsert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'existing-row-id', category: 'Business' }], error: null }),
          }),
        }
      }
      return {}
    })

    const rows = [makeProcessed({ external_id: 'xero-brand-new-uuid', date: '2025-01-15', amount: -100 })]
    const result = await upsertTransactions(rows)

    expect(updatedIds).toContain('existing-row-id')
    expect(result.backfilled).toBe(1)
  })

  it('returns 0 for everything when given an empty array', async () => {
    const result = await upsertTransactions([])
    expect(result).toEqual({ inserted: 0, duplicates: 0, autoCategorised: 0, backfilled: 0 })
  })
})
