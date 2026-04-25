import { describe, it, expect } from 'vitest'
import { applyMerchantCategoryRules } from '../merchantCategoryRules'
import type { RuleContext } from '../merchantCategoryRules'

const expense: RuleContext = { amount: -100, isIncome: false }
const income: RuleContext = { amount: 100, isIncome: true }
const businessIncome: RuleContext = { amount: 100, isIncome: true, accountScope: 'business' }

// ─── ato_payments ─────────────────────────────────────────────────────────────

describe('ato_payments', () => {
  it('matches "ATO" exactly', () => {
    expect(applyMerchantCategoryRules('ATO', expense)?.category).toBe('Government & Tax')
  })

  it('matches "AUSTRALIAN TAXATION OFFICE"', () => {
    expect(applyMerchantCategoryRules('AUSTRALIAN TAXATION OFFICE', expense)?.category).toBe('Government & Tax')
  })

  it('matches "TAX OFFICE PAYMENTS"', () => {
    expect(applyMerchantCategoryRules('TAX OFFICE PAYMENTS', expense)?.category).toBe('Government & Tax')
  })

  it('matches "TAX OFFICE PAYMENTS COMMBANK APP BPAY 75556"', () => {
    const m = 'TAX OFFICE PAYMENTS COMMBANK APP BPAY 75556'
    expect(applyMerchantCategoryRules(m, expense)?.category).toBe('Government & Tax')
  })

  it('does not match unrelated merchants', () => {
    expect(applyMerchantCategoryRules('WOOLWORTHS', expense)).toBeNull()
  })
})

// ─── airbnb ───────────────────────────────────────────────────────────────────

describe('airbnb', () => {
  it('matches "AIRBNB"', () => {
    expect(applyMerchantCategoryRules('AIRBNB', expense)?.category).toBe('Travel')
  })

  it('matches "AIRBNB * HMF33PYHH2 SURRY HILLS"', () => {
    expect(applyMerchantCategoryRules('AIRBNB * HMF33PYHH2 SURRY HILLS', expense)?.category).toBe('Travel')
  })

  it('does not match unrelated merchants', () => {
    expect(applyMerchantCategoryRules('BOOKING.COM', expense)).toBeNull()
  })
})

// ─── uber ─────────────────────────────────────────────────────────────────────

describe('uber', () => {
  it('matches "UBER"', () => {
    expect(applyMerchantCategoryRules('UBER', expense)?.category).toBe('Transport')
  })

  it('matches "UBER* TRIP"', () => {
    expect(applyMerchantCategoryRules('UBER* TRIP', expense)?.category).toBe('Transport')
  })

  it('does not match "UBEREATS" as Transport (word boundary)', () => {
    // UBEREATS should not match UBER\b — but if it does, that's a known limitation to document
    const result = applyMerchantCategoryRules('UBEREATS', expense)
    // UberEats is food delivery, not transport — confirm no match
    expect(result?.ruleName).not.toBe('uber')
  })
})

// ─── bell_partners ────────────────────────────────────────────────────────────

describe('bell_partners', () => {
  it('matches "IPY*BELL PARTNERS BRISBANE QL"', () => {
    expect(applyMerchantCategoryRules('IPY*BELL PARTNERS BRISBANE QL', expense)?.category).toBe('Business')
  })

  it('matches "BELL PARTNERS"', () => {
    expect(applyMerchantCategoryRules('BELL PARTNERS', expense)?.category).toBe('Business')
  })
})

// ─── invoice_income ───────────────────────────────────────────────────────────

describe('invoice_income', () => {
  it('matches "INVOICE" on income', () => {
    const result = applyMerchantCategoryRules('INVOICE', income)
    expect(result?.category).toBe('Business')
    expect(result?.ruleName).toBe('invoice_income')
  })

  it('does NOT match "INVOICE" on expense (could be a fee)', () => {
    expect(applyMerchantCategoryRules('INVOICE', expense)).toBeNull()
  })
})

// ─── director_loan_repayment ──────────────────────────────────────────────────

describe('director_loan_repayment', () => {
  it('matches "STEVEN PICTON" as income → Transfer', () => {
    const result = applyMerchantCategoryRules('STEVEN PICTON', businessIncome)
    expect(result?.isTransfer).toBe(true)
    expect(result?.category).toBeNull()
    expect(result?.ruleName).toBe('director_loan_repayment')
  })

  it('matches "NICOLA PICTON" as income → Transfer', () => {
    const result = applyMerchantCategoryRules('NICOLA PICTON', businessIncome)
    expect(result?.isTransfer).toBe(true)
    expect(result?.category).toBeNull()
  })

  it('does NOT match "STEVEN PICTON" as an expense (outgoing payment to Steve)', () => {
    expect(applyMerchantCategoryRules('STEVEN PICTON', expense)).toBeNull()
  })

  it('does NOT match unrelated income', () => {
    expect(applyMerchantCategoryRules('WOOLWORTHS', income)).toBeNull()
  })
})

// ─── no match ─────────────────────────────────────────────────────────────────

describe('no match', () => {
  it('returns null when no rule applies', () => {
    expect(applyMerchantCategoryRules('RANDOM MERCHANT XYZ', expense)).toBeNull()
  })
})
