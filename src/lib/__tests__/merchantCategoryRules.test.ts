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

// ─── xero_misc_code ───────────────────────────────────────────────────────────

describe('xero_misc_code', () => {
  it('matches "MIS" exactly → Business', () => {
    expect(applyMerchantCategoryRules('MIS', expense)?.category).toBe('Business')
    expect(applyMerchantCategoryRules('MIS', expense)?.ruleName).toBe('xero_misc_code')
  })

  it('does NOT match "MISMATCH" (exact only)', () => {
    expect(applyMerchantCategoryRules('MISMATCH', expense)?.ruleName).not.toBe('xero_misc_code')
  })
})

// ─── google_one ───────────────────────────────────────────────────────────────

describe('google_one', () => {
  it('matches "GOOGLE ONE BARANGA CARD XX6729" (post-fix contact name)', () => {
    expect(applyMerchantCategoryRules('GOOGLE ONE BARANGA CARD XX6729', expense)?.category).toBe('Business')
    expect(applyMerchantCategoryRules('GOOGLE ONE BARANGA CARD XX6729', expense)?.ruleName).toBe('google_one')
  })

  it('matches bare "GOOGLE ONE"', () => {
    expect(applyMerchantCategoryRules('GOOGLE ONE', expense)?.category).toBe('Business')
  })

  it('does NOT match unrelated Google services', () => {
    expect(applyMerchantCategoryRules('GOOGLE ADS', expense)?.ruleName).not.toBe('google_one')
  })
})

// ─── steam_games ──────────────────────────────────────────────────────────────

describe('steam_games', () => {
  it('matches "STEAMGAMES.COM 4259522 BELLEVUE WA" (post-fix contact name)', () => {
    expect(applyMerchantCategoryRules('STEAMGAMES.COM 4259522 BELLEVUE WA', expense)?.category).toBe('Business')
    expect(applyMerchantCategoryRules('STEAMGAMES.COM 4259522 BELLEVUE WA', expense)?.ruleName).toBe('steam_games')
  })

  it('matches bare "STEAMGAMES.COM"', () => {
    expect(applyMerchantCategoryRules('STEAMGAMES.COM', expense)?.category).toBe('Business')
  })
})

// ─── xbox ─────────────────────────────────────────────────────────────────────

describe('xbox', () => {
  it('matches "MICROSOFT*XBOX MSBILL.INFO AUS" (post-fix contact name)', () => {
    expect(applyMerchantCategoryRules('MICROSOFT*XBOX MSBILL.INFO AUS', expense)?.category).toBe('Business')
    expect(applyMerchantCategoryRules('MICROSOFT*XBOX MSBILL.INFO AUS', expense)?.ruleName).toBe('xbox')
  })

  it('matches "MICROSOFT*XBOX SYDNEY AUS"', () => {
    expect(applyMerchantCategoryRules('MICROSOFT*XBOX SYDNEY AUS', expense)?.category).toBe('Business')
  })

  it('matches bare "XBOX"', () => {
    expect(applyMerchantCategoryRules('XBOX', expense)?.category).toBe('Business')
  })
})

// ─── spotify ──────────────────────────────────────────────────────────────────

describe('spotify', () => {
  it('matches "SPOTIFY"', () => {
    expect(applyMerchantCategoryRules('SPOTIFY', expense)?.category).toBe('Business')
    expect(applyMerchantCategoryRules('SPOTIFY', expense)?.ruleName).toBe('spotify')
  })

  it('matches "SPOTIFY AUSTRALIA PTY LTD"', () => {
    expect(applyMerchantCategoryRules('SPOTIFY AUSTRALIA PTY LTD', expense)?.category).toBe('Business')
  })

  it('matches "GOOGLE SPOTIFY MUSIC PYRMONT AUS" (mid-string — same merchant, same intent)', () => {
    expect(applyMerchantCategoryRules('GOOGLE SPOTIFY MUSIC PYRMONT AUS', expense)?.category).toBe('Business')
    expect(applyMerchantCategoryRules('GOOGLE SPOTIFY MUSIC PYRMONT AUS', expense)?.ruleName).toBe('spotify')
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
