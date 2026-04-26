import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()

vi.mock('../supabase/server', () => ({
  createServerClient: () => ({ from: mockFrom }),
}))

import { processBatch, upsertTransactions, type RawTransaction, type ProcessedTransaction } from '../categoryPipeline'

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

describe('processBatch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('skips zero-amount rows entirely', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([raw({ amount: 0 })])
    expect(toUpsert).toHaveLength(0)
  })

  it('auto-categorises a debit using guessCategory when no mapping exists', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([raw({ description: 'WOOLWORTHS 1234', amount: -50 })])
    expect(toUpsert).toHaveLength(1)
    expect(toUpsert[0].category).toBe('Food & Groceries')
    expect(toUpsert[0].is_transfer).toBe(false)
  })

  it('uses an existing merchant mapping over auto-category', async () => {
    setupMocks({
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

  it('income credit that is not director income gets category=null', async () => {
    setupMocks({ accounts: [{ id: ACCOUNT_ID, owner: 'Steven' }] })
    const { toUpsert } = await processBatch([
      raw({ description: 'INTEREST PAYMENT', amount: 12.5 }),
    ])
    expect(toUpsert[0].category).toBeNull()
    expect(toUpsert[0].is_transfer).toBe(false)
    expect(toUpsert[0].classification).toBe('Steven')
  })

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
// processBatch — matched_rule attribution
// ---------------------------------------------------------------------------

describe('processBatch matched_rule', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets matched_rule to director-income:netbank-wage for NETBANK WAGE credit', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([raw({ description: 'NETBANK WAGE CREDIT', amount: 4000 })])
    expect(toUpsert[0].matched_rule).toBe('director-income:netbank-wage')
  })

  it('sets matched_rule to director-income:commbank-app for COMMBANK APP credit', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([raw({ description: 'COMMBANK APP TRANSFER', amount: 2000 })])
    expect(toUpsert[0].matched_rule).toBe('director-income:commbank-app')
  })

  it('sets matched_rule to transfer-pattern for a pattern-matched transfer', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([raw({ description: 'TRANSFER TO XX5426', amount: -1000 })])
    expect(toUpsert[0].is_transfer).toBe(true)
    expect(toUpsert[0].matched_rule).toBe('transfer-pattern')
  })

  it('propagates raw.matched_rule for forced_is_transfer rows (Xero rules)', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([
      raw({ description: 'WAGE TRANSFER', amount: -5000, forced_is_transfer: true, matched_rule: 'xero:personal-wage' }),
    ])
    expect(toUpsert[0].is_transfer).toBe(true)
    expect(toUpsert[0].matched_rule).toBe('xero:personal-wage')
  })

  it('sets matched_rule to null for raw.is_transfer=true without forced_is_transfer (external flag)', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([
      raw({ description: 'INTERNAL MEMO', amount: -1000, is_transfer: true }),
    ])
    expect(toUpsert[0].is_transfer).toBe(true)
    expect(toUpsert[0].matched_rule).toBeNull()
  })

  it('sets matched_rule to merchant:ato_payments for ATO debit', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([raw({ description: 'ATO PAYMENT REF12345', amount: -2000 })])
    expect(toUpsert[0].category).toBe('Government & Tax')
    expect(toUpsert[0].matched_rule).toBe('merchant:ato_payments')
  })

  it('sets matched_rule to null when merchant_mappings table overrides the rule', async () => {
    setupMocks({
      mappings: [{ merchant: 'ATO PAYMENT REF12345', category: 'Business', classification: null }],
    })
    const { toUpsert } = await processBatch([raw({ description: 'ATO PAYMENT REF12345', amount: -2000 })])
    expect(toUpsert[0].category).toBe('Business')
    expect(toUpsert[0].matched_rule).toBeNull()
  })

  it('sets matched_rule to null for keyword guesses (guessCategory)', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([raw({ description: 'WOOLWORTHS 1234', amount: -50 })])
    expect(toUpsert[0].category).toBe('Food & Groceries')
    expect(toUpsert[0].matched_rule).toBeNull()
  })

  it('sets matched_rule to null for income with no rule match', async () => {
    setupMocks({ accounts: [{ id: ACCOUNT_ID, owner: 'Steven' }] })
    const { toUpsert } = await processBatch([raw({ description: 'INTEREST PAYMENT', amount: 12.5 })])
    expect(toUpsert[0].matched_rule).toBeNull()
  })

  it('sets matched_rule to merchant:director_loan_repayment for personal name income', async () => {
    setupMocks()
    const { toUpsert } = await processBatch([raw({ description: 'STEVEN PICTON', amount: 5000 })])
    expect(toUpsert[0].is_transfer).toBe(true)
    expect(toUpsert[0].matched_rule).toBe('merchant:director_loan_repayment')
  })
})

// ---------------------------------------------------------------------------
// upsertTransactions
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
    matched_rule: null,
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

  it('rows WITHOUT external_id use select-then-insert (no ON CONFLICT)', async () => {
    const capturedInserts: unknown[] = []

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      // CSV dedup path now ends at .in() (no .is() call after fix).
      // Make .in() return a thenable so it can be awaited directly,
      // while still exposing .is() for the backfill path if needed.
      in: vi.fn().mockImplementation(() => {
        const p = Promise.resolve({ data: [], error: null }) as any
        p.is = vi.fn().mockResolvedValue({ data: [], error: null })
        return p
      }),
      insert: vi.fn().mockImplementation((rows: unknown) => {
        capturedInserts.push(rows)
        return { select: vi.fn().mockResolvedValue({ data: [{ id: '1', category: null }], error: null }) }
      }),
    }))

    const rows = [makeProcessed({ external_id: null })]
    await upsertTransactions(rows)
    expect(capturedInserts.length).toBeGreaterThan(0)
  })

  it('mixed batch: rows with external_id upsert, rows without are select-then-insert', async () => {
    const capturedConflicts: string[] = []
    const capturedInserts: unknown[] = []

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      // .in() returns a thenable (for CSV dedup path) that also has .is() (for backfill path)
      in: vi.fn().mockImplementation(() => {
        const p = Promise.resolve({ data: [], error: null }) as any
        p.is = vi.fn().mockResolvedValue({ data: [], error: null })
        return p
      }),
      upsert: vi.fn().mockImplementation((_rows: unknown, opts: { onConflict?: string }) => {
        if (opts?.onConflict) capturedConflicts.push(opts.onConflict)
        return { select: vi.fn().mockResolvedValue({ data: [{ id: '1', category: null }], error: null }) }
      }),
      insert: vi.fn().mockImplementation((rows: unknown) => {
        capturedInserts.push(rows)
        return { select: vi.fn().mockResolvedValue({ data: [{ id: '1', category: null }], error: null }) }
      }),
    }))

    const rows = [
      makeProcessed({ external_id: 'xero-uuid-1' }),
      makeProcessed({ external_id: null, description: 'CSV IMPORT', merchant: 'CSV IMPORT' }),
    ]
    await upsertTransactions(rows)
    // Xero row: upserted on external_id
    expect(capturedConflicts).toContain('external_id')
    expect(capturedConflicts).not.toContain('account_id,date,amount,description')
    // CSV row: plain inserted after dedup check
    expect(capturedInserts.length).toBeGreaterThan(0)
  })

  it('backfill: stamps an existing null-external_id row via bulk upsert before main upsert', async () => {
    const upsertCalls: { rows: unknown; onConflict: string }[] = []

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
          upsert: vi.fn().mockImplementation((rows: unknown, opts: { onConflict?: string }) => {
            upsertCalls.push({ rows, onConflict: opts?.onConflict ?? '' })
            return { select: vi.fn().mockResolvedValue({ data: [{ id: 'existing-row-id', category: 'Business' }], error: null }) }
          }),
        }
      }
      return {}
    })

    const rows = [makeProcessed({ external_id: 'xero-brand-new-uuid', date: '2025-01-15', amount: -100 })]
    const result = await upsertTransactions(rows)

    const backfillCall = upsertCalls.find(c => c.onConflict === 'id')
    expect(backfillCall).toBeDefined()
    expect(backfillCall!.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'existing-row-id', external_id: 'xero-brand-new-uuid' }),
      ])
    )
    expect(result.backfilled).toBe(1)
  })

  it('CSV row matching an existing Xero row (by date+amount+description) is skipped, not inserted', async () => {
    // Regression test for the bug where the CSV dedup query only checked rows
    // WHERE external_id IS NULL, so Xero rows were invisible to dedup and CSV
    // imports would insert duplicates alongside existing Xero records.
    const capturedInserts: unknown[] = []

    const xeroRow = {
      date: '2025-06-01',
      amount: -29.99,
      description: 'GOOGLE ONE BARANGA CARD XX6729',
    }

    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockImplementation(() => {
        // Simulate a Xero row already existing with the same key (no .is() filter)
        const p = Promise.resolve({ data: [xeroRow], error: null }) as any
        p.is = vi.fn().mockResolvedValue({ data: [], error: null })
        return p
      }),
      insert: vi.fn().mockImplementation((rows: unknown) => {
        capturedInserts.push(rows)
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) }
      }),
    }))

    const csvRow = makeProcessed({
      external_id: null,
      date: xeroRow.date,
      amount: xeroRow.amount,
      description: xeroRow.description,
    })
    await upsertTransactions([csvRow])
    // The CSV row matches the Xero row on date+amount+description → must not insert
    expect(capturedInserts).toHaveLength(0)
  })

  it('returns 0 for everything when given an empty array', async () => {
    const result = await upsertTransactions([])
    expect(result).toEqual({ inserted: 0, duplicates: 0, autoCategorised: 0, backfilled: 0 })
  })
})
