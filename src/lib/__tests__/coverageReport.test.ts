import { describe, it, expect } from 'vitest'
import { buildCoverageRows, expandMerchantRows } from '../coverageReport'
import type { TxForCoverage } from '../coverageReport'

// ─── buildCoverageRows ────────────────────────────────────────────────────────

describe('buildCoverageRows', () => {
  it('groups transactions by merchant and counts correctly', () => {
    const rows: TxForCoverage[] = [
      { merchant: 'WOOLWORTHS', amount: -50, category: 'Groceries', matched_rule: null, classification: 'Joint', raw_description: 'WOOLWORTHS BARANGA' },
      { merchant: 'WOOLWORTHS', amount: -30, category: 'Groceries', matched_rule: null, classification: 'Joint', raw_description: 'WOOLWORTHS ONLINE' },
      { merchant: 'COLES', amount: -40, category: 'Groceries', matched_rule: null, classification: 'Joint', raw_description: 'COLES BARANGA' },
    ]

    const result = buildCoverageRows(rows)

    expect(result).toHaveLength(2)
    const woolworths = result.find(r => r.merchant === 'WOOLWORTHS')!
    expect(woolworths.count).toBe(2)
    expect(woolworths.totalValue).toBe(-80)
    expect(woolworths.autoCategory).toBe('Groceries')
    expect(woolworths.autoOwner).toBe('Joint')
    expect(woolworths.matchStatus).toBe('unmatched')
  })

  it('picks the first raw_description seen for each merchant', () => {
    const rows: TxForCoverage[] = [
      { merchant: 'NETFLIX', amount: -22.99, category: null, matched_rule: 'merchant:netflix', classification: null, raw_description: 'NETFLIX.COM FIRST' },
      { merchant: 'NETFLIX', amount: -22.99, category: null, matched_rule: 'merchant:netflix', classification: null, raw_description: 'NETFLIX.COM SECOND' },
    ]

    const result = buildCoverageRows(rows)
    expect(result[0].exampleRawDescription).toBe('NETFLIX.COM FIRST')
  })

  it('attaches matched_rule from the first transaction for the merchant', () => {
    const rows: TxForCoverage[] = [
      { merchant: 'ATO', amount: -1000, category: 'Government & Tax', matched_rule: 'merchant:ato_payments', classification: null, raw_description: null },
    ]

    const result = buildCoverageRows(rows)
    expect(result[0].matchedRule).toBe('merchant:ato_payments')
  })

  it('sorts by transaction count descending', () => {
    const rows: TxForCoverage[] = [
      { merchant: 'A', amount: -10, category: null, matched_rule: null, classification: null, raw_description: null },
      { merchant: 'B', amount: -10, category: null, matched_rule: null, classification: null, raw_description: null },
      { merchant: 'B', amount: -10, category: null, matched_rule: null, classification: null, raw_description: null },
      { merchant: 'B', amount: -10, category: null, matched_rule: null, classification: null, raw_description: null },
      { merchant: 'C', amount: -10, category: null, matched_rule: null, classification: null, raw_description: null },
      { merchant: 'C', amount: -10, category: null, matched_rule: null, classification: null, raw_description: null },
    ]

    const result = buildCoverageRows(rows)
    expect(result.map(r => r.merchant)).toEqual(['B', 'C', 'A'])
  })

  it('returns empty array for empty input', () => {
    expect(buildCoverageRows([])).toEqual([])
  })
})

// ─── buildCoverageRows — matchStatus ─────────────────────────────────────────

describe('buildCoverageRows — matchStatus', () => {
  it('assigns matchStatus=rule when matched_rule is present', () => {
    const rows: TxForCoverage[] = [
      { merchant: 'NETFLIX', amount: -22.99, category: null, matched_rule: 'merchant:netflix', classification: null, raw_description: null },
    ]
    const result = buildCoverageRows(rows)
    expect(result[0].matchStatus).toBe('rule')
  })

  it('assigns matchStatus=gl when no rule but at least one tx has gl_account', () => {
    const rows: TxForCoverage[] = [
      { merchant: 'BHT PAYMENT', amount: -1000, category: null, matched_rule: null, classification: null, raw_description: null, gl_account: 'Superannuation Payable' },
      { merchant: 'BHT PAYMENT', amount: -500, category: null, matched_rule: null, classification: null, raw_description: null, gl_account: null },
    ]
    const result = buildCoverageRows(rows)
    expect(result[0].matchStatus).toBe('gl')
  })

  it('assigns matchStatus=unmatched when no rule and no gl_account on any tx', () => {
    const rows: TxForCoverage[] = [
      { merchant: 'UNKNOWN CO', amount: -50, category: null, matched_rule: null, classification: null, raw_description: null, gl_account: null },
      { merchant: 'UNKNOWN CO', amount: -30, category: null, matched_rule: null, classification: null, raw_description: null, gl_account: null },
    ]
    const result = buildCoverageRows(rows)
    expect(result[0].matchStatus).toBe('unmatched')
  })

  it('gl_account on any one tx is enough to make the merchant gl', () => {
    const rows: TxForCoverage[] = [
      { merchant: 'MIXED', amount: -10, category: null, matched_rule: null, classification: null, raw_description: null, gl_account: null },
      { merchant: 'MIXED', amount: -10, category: null, matched_rule: null, classification: null, raw_description: null, gl_account: null },
      { merchant: 'MIXED', amount: -10, category: null, matched_rule: null, classification: null, raw_description: null, gl_account: 'Sales Revenue' },
    ]
    const result = buildCoverageRows(rows)
    expect(result[0].matchStatus).toBe('gl')
  })

  it('filterStatus=unmatched returns only unmatched merchants', () => {
    const rows: TxForCoverage[] = [
      { merchant: 'ATO', amount: -100, category: 'Government & Tax', matched_rule: 'merchant:ato_payments', classification: null, raw_description: null },
      { merchant: 'BHT PAYMENT', amount: -1000, category: null, matched_rule: null, classification: null, raw_description: null, gl_account: 'Wages & Salaries' },
      { merchant: 'RANDOM CO', amount: -50, category: null, matched_rule: null, classification: null, raw_description: null },
      { merchant: 'UNKNOWN VENDOR', amount: -80, category: null, matched_rule: null, classification: null, raw_description: null },
    ]

    const result = buildCoverageRows(rows, 'unmatched')

    expect(result).toHaveLength(2)
    expect(result.map(r => r.merchant)).toContain('RANDOM CO')
    expect(result.map(r => r.merchant)).toContain('UNKNOWN VENDOR')
    expect(result.map(r => r.merchant)).not.toContain('ATO')
    expect(result.map(r => r.merchant)).not.toContain('BHT PAYMENT')
  })

  it('filterStatus=gl returns only gl merchants', () => {
    const rows: TxForCoverage[] = [
      { merchant: 'ATO', amount: -100, category: null, matched_rule: 'merchant:ato_payments', classification: null, raw_description: null },
      { merchant: 'BHT PAYMENT', amount: -1000, category: null, matched_rule: null, classification: null, raw_description: null, gl_account: 'Wages & Salaries' },
      { merchant: 'RANDOM CO', amount: -50, category: null, matched_rule: null, classification: null, raw_description: null },
    ]

    const result = buildCoverageRows(rows, 'gl')

    expect(result).toHaveLength(1)
    expect(result[0].merchant).toBe('BHT PAYMENT')
    expect(result[0].matchStatus).toBe('gl')
  })

  it('filterStatus=rule returns only rule merchants', () => {
    const rows: TxForCoverage[] = [
      { merchant: 'NETFLIX', amount: -22.99, category: null, matched_rule: 'merchant:netflix', classification: null, raw_description: null },
      { merchant: 'ATO', amount: -100, category: null, matched_rule: 'merchant:ato_payments', classification: null, raw_description: null },
      { merchant: 'RANDOM CO', amount: -50, category: null, matched_rule: null, classification: null, raw_description: null },
    ]

    const result = buildCoverageRows(rows, 'rule')

    expect(result).toHaveLength(2)
    expect(result.map(r => r.merchant)).toContain('NETFLIX')
    expect(result.map(r => r.merchant)).toContain('ATO')
    expect(result.map(r => r.merchant)).not.toContain('RANDOM CO')
  })

  it('null filterStatus returns all merchants', () => {
    const rows: TxForCoverage[] = [
      { merchant: 'ATO', amount: -100, category: 'Government & Tax', matched_rule: 'merchant:ato_payments', classification: null, raw_description: null },
      { merchant: 'RANDOM CO', amount: -50, category: null, matched_rule: null, classification: null, raw_description: null },
    ]

    const result = buildCoverageRows(rows, null)
    expect(result).toHaveLength(2)
  })
})

// ─── expandMerchantRows ───────────────────────────────────────────────────────

describe('expandMerchantRows', () => {
  it('maps each transaction to the expansion row format', () => {
    const rows: TxForCoverage[] = [
      { merchant: 'NETFLIX', amount: -22.99, category: null, matched_rule: null, classification: null, raw_description: 'NETFLIX.COM', gl_account: null, date: '2024-01-15' },
    ]

    const result = expandMerchantRows(rows)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      date: '2024-01-15',
      amount: -22.99,
      glAccount: null,
      isIncome: false,
      rawDescription: 'NETFLIX.COM',
    })
  })

  it('derives isIncome from amount sign', () => {
    const rows: TxForCoverage[] = [
      { merchant: 'ONCORE', amount: 5000, category: 'Business', matched_rule: 'merchant:oncore_income', classification: 'Business', raw_description: null, date: '2024-01-10' },
    ]

    const result = expandMerchantRows(rows)
    expect(result[0].isIncome).toBe(true)
  })

  it('returns all unique context combinations for a merchant with multiple transactions', () => {
    // The key value of expansion: different glAccount and isIncome values are all visible
    const rows: TxForCoverage[] = [
      {
        merchant: 'BHT PAYMENT',
        amount: -1000,
        category: 'Business',
        matched_rule: null,
        classification: null,
        raw_description: 'Payment ref A',
        gl_account: 'Superannuation Payable',
        date: '2024-01-10',
      },
      {
        merchant: 'BHT PAYMENT',
        amount: -500,
        category: 'Business',
        matched_rule: null,
        classification: null,
        raw_description: 'Payment ref B',
        gl_account: '2025 Directors Loan',
        date: '2024-02-15',
      },
      {
        merchant: 'BHT PAYMENT',
        amount: 200,
        category: null,
        matched_rule: null,
        classification: null,
        raw_description: 'Refund',
        gl_account: null,
        date: '2024-03-01',
      },
    ]

    const result = expandMerchantRows(rows)

    expect(result).toHaveLength(3)
    const glAccounts = result.map(r => r.glAccount)
    expect(glAccounts).toContain('Superannuation Payable')
    expect(glAccounts).toContain('2025 Directors Loan')
    expect(glAccounts).toContain(null)

    const incomeValues = result.map(r => r.isIncome)
    expect(incomeValues).toContain(true)
    expect(incomeValues).toContain(false)
  })

  it('returns empty array for empty input', () => {
    expect(expandMerchantRows([])).toEqual([])
  })
})
