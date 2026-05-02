import { describe, it, expect } from 'vitest'
import { applyMerchantCategoryRules, MERCHANT_CATEGORY_RULES } from '../merchantCategoryRules'
import type { RuleContext } from '../merchantCategoryRules'
import { CATEGORIES } from '../categories'

const expense: RuleContext = { isIncome: false }
const income: RuleContext = { isIncome: true }

// ─── ato_payments ─────────────────────────────────────────────────────────────

describe('ato_payments', () => {
  it('matches "ATO" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('ATO', expense)
    expect(result?.category).toBe('Government & Tax')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBeNull()
  })

  it('matches "AUSTRALIAN TAXATION OFFICE"', () => {
    const result = applyMerchantCategoryRules('AUSTRALIAN TAXATION OFFICE', expense)
    expect(result?.category).toBe('Government & Tax')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBeNull()
  })

  it('matches "TAX OFFICE PAYMENTS"', () => {
    const result = applyMerchantCategoryRules('TAX OFFICE PAYMENTS', expense)
    expect(result?.category).toBe('Government & Tax')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBeNull()
  })

  it('matches "TAX OFFICE PAYMENTS COMMBANK APP BPAY 75556"', () => {
    const result = applyMerchantCategoryRules('TAX OFFICE PAYMENTS COMMBANK APP BPAY 75556', expense)
    expect(result?.category).toBe('Government & Tax')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBeNull()
  })

  it('does not match unrelated merchants', () => {
    expect(applyMerchantCategoryRules('WOOLWORTHS', expense)).toBeNull()
  })
})

// ─── airbnb ───────────────────────────────────────────────────────────────────

describe('airbnb', () => {
  it('matches "AIRBNB" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('AIRBNB', expense)
    expect(result?.category).toBe('Travel')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBeNull()
  })

  it('matches "AIRBNB * HMF33PYHH2 SURRY HILLS"', () => {
    const result = applyMerchantCategoryRules('AIRBNB * HMF33PYHH2 SURRY HILLS', expense)
    expect(result?.category).toBe('Travel')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBeNull()
  })

  it('does not match unrelated merchants', () => {
    expect(applyMerchantCategoryRules('BOOKING.COM', expense)).toBeNull()
  })
})

// ─── uber ─────────────────────────────────────────────────────────────────────

describe('uber', () => {
  it('matches "UBER" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('UBER', expense)
    expect(result?.category).toBe('Transport')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBeNull()
  })

  it('matches "UBER* TRIP"', () => {
    const result = applyMerchantCategoryRules('UBER* TRIP', expense)
    expect(result?.category).toBe('Transport')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBeNull()
  })

  it('does not match "UBEREATS" as Transport (word boundary)', () => {
    const result = applyMerchantCategoryRules('UBEREATS', expense)
    expect(result?.ruleName).not.toBe('uber')
  })
})

// ─── bell_partners ────────────────────────────────────────────────────────────

describe('bell_partners', () => {
  it('matches "BELL PARTNERS" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('BELL PARTNERS', expense)
    expect(result?.category).toBe('Accounting')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Business')
  })

  it('matches "IPY*BELL PARTNERS BRISBANE QL"', () => {
    const result = applyMerchantCategoryRules('IPY*BELL PARTNERS BRISBANE QL', expense)
    expect(result?.category).toBe('Accounting')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Business')
  })
})

// ─── invoice_income ───────────────────────────────────────────────────────────

describe('invoice_income', () => {
  it('matches "INVOICE" on income — full fingerprint', () => {
    const result = applyMerchantCategoryRules('INVOICE', income)
    expect(result?.category).toBe('Business Revenue')
    expect(result?.isIncome).toBe(true)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Business')
    expect(result?.ruleName).toBe('invoice_income')
  })

  it('does NOT match "INVOICE" on expense (could be a fee)', () => {
    expect(applyMerchantCategoryRules('INVOICE', expense)).toBeNull()
  })
})

// ─── oncore_income ────────────────────────────────────────────────────────────

describe('oncore_income', () => {
  it('matches "ONCORE" on income — full fingerprint', () => {
    const result = applyMerchantCategoryRules('ONCORE', income)
    expect(result?.category).toBe('Business Revenue')
    expect(result?.isIncome).toBe(true)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Business')
    expect(result?.ruleName).toBe('oncore_income')
  })

  it('matches "E41900232233 Oncore Contracto" on income', () => {
    const result = applyMerchantCategoryRules('E41900232233 Oncore Contracto', income)
    expect(result?.category).toBe('Business Revenue')
    expect(result?.isIncome).toBe(true)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Business')
  })

  it('does NOT match on expense', () => {
    expect(applyMerchantCategoryRules('ONCORE', expense)).toBeNull()
  })
})

// ─── crosslateral_income ──────────────────────────────────────────────────────

describe('crosslateral_income', () => {
  it('matches "CROSSLATERAL" on income — full fingerprint', () => {
    const result = applyMerchantCategoryRules('CROSSLATERAL', income)
    expect(result?.category).toBe('Business Revenue')
    expect(result?.isIncome).toBe(true)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Business')
    expect(result?.ruleName).toBe('crosslateral_income')
  })

  it('does NOT match on expense', () => {
    expect(applyMerchantCategoryRules('CROSSLATERAL', expense)).toBeNull()
  })
})

// ─── superannuation_payable ───────────────────────────────────────────────────

describe('superannuation_payable', () => {
  it('matches when glAccount = "Superannuation Payable" — full fingerprint', () => {
    const ctx: RuleContext = { isIncome: false, glAccount: 'Superannuation Payable' }
    const result = applyMerchantCategoryRules('payment', ctx)
    expect(result?.category).toBe('Payroll Expense')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Business')
    expect(result?.ruleName).toBe('superannuation_payable')
  })

  it('is case-insensitive on GL account name', () => {
    const ctx: RuleContext = { isIncome: false, glAccount: 'SUPERANNUATION PAYABLE' }
    expect(applyMerchantCategoryRules('payment', ctx)?.ruleName).toBe('superannuation_payable')
  })

  it('does NOT match without glAccount', () => {
    expect(applyMerchantCategoryRules('SUPERANNUATION', expense)).toBeNull()
  })
})

// ─── income_tax_provision ─────────────────────────────────────────────────────

describe('income_tax_provision', () => {
  it('matches when glAccount contains "income tax" — full fingerprint', () => {
    const ctx: RuleContext = { isIncome: false, glAccount: 'Income Tax Provision' }
    const result = applyMerchantCategoryRules('payment', ctx)
    expect(result?.category).toBe('Government & Tax')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Business')
    expect(result?.ruleName).toBe('income_tax_provision')
  })

  it('is case-insensitive', () => {
    const ctx: RuleContext = { isIncome: false, glAccount: 'INCOME TAX' }
    expect(applyMerchantCategoryRules('payment', ctx)?.ruleName).toBe('income_tax_provision')
  })
})

// ─── xero_misc_code ───────────────────────────────────────────────────────────

describe('xero_misc_code', () => {
  it('matches "MIS" exactly — full fingerprint', () => {
    const result = applyMerchantCategoryRules('MIS', expense)
    expect(result?.category).toBe('Office Expenses')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBeNull()
    expect(result?.ruleName).toBe('xero_misc_code')
  })

  it('does NOT match "MISMATCH" (exact only)', () => {
    expect(applyMerchantCategoryRules('MISMATCH', expense)?.ruleName).not.toBe('xero_misc_code')
  })
})

// ─── google_one ───────────────────────────────────────────────────────────────

describe('google_one', () => {
  it('matches "GOOGLE ONE" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('GOOGLE ONE', expense)
    expect(result?.category).toBe('Technology')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(true)
    expect(result?.owner).toBe('Business')
    expect(result?.ruleName).toBe('google_one')
  })

  it('matches "GOOGLE ONE BARANGA CARD XX6729" (post-fix contact name)', () => {
    const result = applyMerchantCategoryRules('GOOGLE ONE BARANGA CARD XX6729', expense)
    expect(result?.category).toBe('Technology')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(true)
    expect(result?.owner).toBe('Business')
  })

  it('does NOT match unrelated Google services', () => {
    expect(applyMerchantCategoryRules('GOOGLE ADS', expense)?.ruleName).not.toBe('google_one')
  })
})

// ─── steam_games ──────────────────────────────────────────────────────────────

describe('steam_games', () => {
  it('matches "STEAMGAMES.COM" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('STEAMGAMES.COM', expense)
    expect(result?.category).toBe('Entertainment')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Business')
    expect(result?.ruleName).toBe('steam_games')
  })

  it('matches "STEAMGAMES.COM 4259522 BELLEVUE WA" (post-fix contact name)', () => {
    const result = applyMerchantCategoryRules('STEAMGAMES.COM 4259522 BELLEVUE WA', expense)
    expect(result?.category).toBe('Entertainment')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Business')
  })
})

// ─── xbox ─────────────────────────────────────────────────────────────────────

describe('xbox', () => {
  it('matches "XBOX" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('XBOX', expense)
    expect(result?.category).toBe('Entertainment')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(true)
    expect(result?.owner).toBe('Business')
    expect(result?.ruleName).toBe('xbox')
  })

  it('matches "MICROSOFT*XBOX MSBILL.INFO AUS"', () => {
    const result = applyMerchantCategoryRules('MICROSOFT*XBOX MSBILL.INFO AUS', expense)
    expect(result?.category).toBe('Entertainment')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(true)
    expect(result?.owner).toBe('Business')
  })

  it('matches "MICROSOFT*XBOX SYDNEY AUS"', () => {
    const result = applyMerchantCategoryRules('MICROSOFT*XBOX SYDNEY AUS', expense)
    expect(result?.category).toBe('Entertainment')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(true)
    expect(result?.owner).toBe('Business')
  })
})

// ─── spotify ──────────────────────────────────────────────────────────────────

describe('spotify', () => {
  it('matches "SPOTIFY" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('SPOTIFY', expense)
    expect(result?.category).toBe('Entertainment')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(true)
    expect(result?.owner).toBe('Business')
    expect(result?.ruleName).toBe('spotify')
  })

  it('matches "SPOTIFY AUSTRALIA PTY LTD"', () => {
    const result = applyMerchantCategoryRules('SPOTIFY AUSTRALIA PTY LTD', expense)
    expect(result?.category).toBe('Entertainment')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(true)
    expect(result?.owner).toBe('Business')
  })

  it('matches "GOOGLE SPOTIFY MUSIC PYRMONT AUS" (mid-string — same merchant, same intent)', () => {
    const result = applyMerchantCategoryRules('GOOGLE SPOTIFY MUSIC PYRMONT AUS', expense)
    expect(result?.category).toBe('Entertainment')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(true)
    expect(result?.owner).toBe('Business')
    expect(result?.ruleName).toBe('spotify')
  })
})

// ─── bht_directors_loan_transfer ──────────────────────────────────────────────

describe('bht_directors_loan_transfer', () => {
  it('matches when glAccount contains "directors loan" — full fingerprint', () => {
    const ctx: RuleContext = { isIncome: false, glAccount: '2025 Directors Loan' }
    const result = applyMerchantCategoryRules('payment', ctx)
    expect(result?.category).toBeNull()
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(true)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBeNull()
    expect(result?.ruleName).toBe('bht_directors_loan_transfer')
  })

  it('is case-insensitive on GL account name', () => {
    const ctx: RuleContext = { isIncome: false, glAccount: 'DIRECTORS LOAN ACCOUNT' }
    expect(applyMerchantCategoryRules('payment', ctx)?.ruleName).toBe('bht_directors_loan_transfer')
  })

  it('does NOT match without glAccount', () => {
    expect(applyMerchantCategoryRules('DIRECTORS LOAN', expense)).toBeNull()
  })
})

// ─── director_loan_repayment ──────────────────────────────────────────────────

describe('director_loan_repayment', () => {
  it('matches "STEVEN PICTON" as income — full fingerprint', () => {
    const result = applyMerchantCategoryRules('STEVEN PICTON', income)
    expect(result?.category).toBeNull()
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(true)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBeNull()
    expect(result?.ruleName).toBe('director_loan_repayment')
  })

  it('matches "NICOLA PICTON" as income', () => {
    const result = applyMerchantCategoryRules('NICOLA PICTON', income)
    expect(result?.category).toBeNull()
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(true)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBeNull()
  })

  it('does NOT match "STEVEN PICTON" as an expense', () => {
    expect(applyMerchantCategoryRules('STEVEN PICTON', expense)).toBeNull()
  })

  it('does NOT match unrelated income', () => {
    expect(applyMerchantCategoryRules('WOOLWORTHS', income)).toBeNull()
  })
})

// ─── salary_nicola_education_qld ──────────────────────────────────────────────

describe('salary_nicola_education_qld', () => {
  it('matches income — full fingerprint', () => {
    const result = applyMerchantCategoryRules('SALARY EDUCATION QLD', income)
    expect(result?.category).toBe('Salary')
    expect(result?.isIncome).toBe(true)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Nicola')
    expect(result?.ruleName).toBe('salary_nicola_education_qld')
  })

  it('does NOT match on expense (debit)', () => {
    expect(applyMerchantCategoryRules('SALARY EDUCATION QLD', expense)).toBeNull()
  })
})

// ─── translink ────────────────────────────────────────────────────────────────

describe('translink', () => {
  it('matches "TRANSLINK" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('TRANSLINK', expense)
    expect(result?.category).toBe('Transport')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('translink')
  })

  it('matches mid-string', () => {
    expect(applyMerchantCategoryRules('BPAY TRANSLINK QLD', expense)?.ruleName).toBe('translink')
  })
})

// ─── qld_transport_rego ───────────────────────────────────────────────────────

describe('qld_transport_rego', () => {
  it('matches "QLD DEPARTMENT OF TRANSPORT" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('QLD DEPARTMENT OF TRANSPORT', expense)
    expect(result?.category).toBe('Government & Tax')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('qld_transport_rego')
  })
})

// ─── mansfield_state_high ─────────────────────────────────────────────────────

describe('mansfield_state_high', () => {
  it('matches "MANSFIELD STATE HIGH" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('MANSFIELD STATE HIGH', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('mansfield_state_high')
  })
})

// ─── learning_ladders ─────────────────────────────────────────────────────────

describe('learning_ladders', () => {
  it('matches "LEARNINGLADDERS" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('LEARNINGLADDERS', expense)
    expect(result?.category).toBe('Education')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(true)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('learning_ladders')
  })
})

// ─── fitness_passport ─────────────────────────────────────────────────────────

describe('fitness_passport', () => {
  it('matches "FITNESS PASSPORT" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('FITNESS PASSPORT', expense)
    expect(result?.category).toBe('Health & Fitness')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(true)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('fitness_passport')
  })
})

// ─── fitstop ──────────────────────────────────────────────────────────────────

describe('fitstop', () => {
  it('matches "FITSTOP CARINDALE" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('FITSTOP CARINDALE', expense)
    expect(result?.category).toBe('Health & Fitness')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(true)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('fitstop')
  })

  it('does NOT match "GYM FITSTOP" (must start with fitstop)', () => {
    expect(applyMerchantCategoryRules('GYM FITSTOP', expense)?.ruleName).not.toBe('fitstop')
  })
})

// ─── fitbox ───────────────────────────────────────────────────────────────────

describe('fitbox', () => {
  it('matches "FITBOX BOXING" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('FITBOX BOXING', expense)
    expect(result?.category).toBe('Health & Fitness')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(true)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('fitbox')
  })
})

// ─── ironfist_gym ─────────────────────────────────────────────────────────────

describe('ironfist_gym', () => {
  it('matches "EZI*THEIRONFISTGYM" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('EZI*THEIRONFISTGYM', expense)
    expect(result?.category).toBe('Health & Fitness')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('ironfist_gym')
  })

  it('matches "IRONFIST GYM"', () => {
    expect(applyMerchantCategoryRules('IRONFIST GYM', expense)?.ruleName).toBe('ironfist_gym')
  })
})

// ─── hcf_health_insurance ─────────────────────────────────────────────────────

describe('hcf_health_insurance', () => {
  it('matches "HCFHEALTH" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('HCFHEALTH', expense)
    expect(result?.category).toBe('Insurance')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(true)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('hcf_health_insurance')
  })
})

// ─── hospitals_contribution ───────────────────────────────────────────────────

describe('hospitals_contribution', () => {
  it('matches "THE HOSPITALS CONTRIBUTION" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('THE HOSPITALS CONTRI FUND', expense)
    expect(result?.category).toBe('Insurance')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(true)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('hospitals_contribution')
  })
})

// ─── clearview_insurance ──────────────────────────────────────────────────────

describe('clearview_insurance', () => {
  it('matches "CLEARVIEW LIFE" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('CLEARVIEW LIFE ASSURANCE', expense)
    expect(result?.category).toBe('Insurance')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(true)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('clearview_insurance')
  })
})

// ─── qld_urban_utilities ──────────────────────────────────────────────────────

describe('qld_urban_utilities', () => {
  it('matches "QLD URBAN UTILITIES" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('QLD URBAN UTILITIES', expense)
    expect(result?.category).toBe('Utilities')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('qld_urban_utilities')
  })
})

// ─── brisbane_city_council ────────────────────────────────────────────────────

describe('brisbane_city_council', () => {
  it('matches "BRISBANE CITY COUNCIL" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('BRISBANE CITY COUNCIL', expense)
    expect(result?.category).toBe('Government & Tax')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('brisbane_city_council')
  })
})

// ─── bcc_rates ────────────────────────────────────────────────────────────────

describe('bcc_rates', () => {
  it('matches "BCC RATES" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('BCC RATES BPAY', expense)
    expect(result?.category).toBe('Government & Tax')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('bcc_rates')
  })
})

// ─── the_bread_corner ─────────────────────────────────────────────────────────

describe('the_bread_corner', () => {
  it('matches "THE BREAD CORNER" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('THE BREAD CORNER', expense)
    expect(result?.category).toBe('Food & Groceries')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('the_bread_corner')
  })
})

// ─── apple_bill ───────────────────────────────────────────────────────────────

describe('apple_bill', () => {
  it('matches "APPLE.COM/BILL" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('APPLE.COM/BILL', expense)
    expect(result?.category).toBe('Technology')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(true)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('apple_bill')
  })

  it('matches "APPLE.COM/BILL ITUNES.COM AUS"', () => {
    expect(applyMerchantCategoryRules('APPLE.COM/BILL ITUNES.COM AUS', expense)?.ruleName).toBe('apple_bill')
  })
})

// ─── no match ─────────────────────────────────────────────────────────────────

describe('no match', () => {
  it('returns null when no rule applies', () => {
    expect(applyMerchantCategoryRules('RANDOM MERCHANT XYZ', expense)).toBeNull()
  })
})

// ─── fingerprint integrity ────────────────────────────────────────────────────

describe('fingerprint integrity', () => {
  it('has no unintentional fingerprint collisions', () => {
    const intentionalCollisions = new Set([
      // invoice_income, oncore_income, crosslateral_income — same output type, different match patterns
      JSON.stringify({ category: 'Business Revenue', isIncome: true, isTransfer: false, isSubscription: false, owner: 'Business' }),
      // bht_directors_loan_transfer, director_loan_repayment — both inter-account transfers
      JSON.stringify({ category: null, isIncome: null, isTransfer: true, isSubscription: false, owner: null }),
      // xbox, spotify — both Entertainment subscriptions on the BHT account
      JSON.stringify({ category: 'Entertainment', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' }),
      // fitness_passport, fitstop, fitbox — all Joint Health & Fitness subscriptions
      JSON.stringify({ category: 'Health & Fitness', isIncome: false, isTransfer: false, isSubscription: true, owner: 'Joint' }),
      // hcf_health_insurance, hospitals_contribution, clearview_insurance — all Joint Insurance subscriptions
      JSON.stringify({ category: 'Insurance', isIncome: false, isTransfer: false, isSubscription: true, owner: 'Joint' }),
      // brisbane_city_council, bcc_rates, qld_transport_rego — all Joint Government & Tax (non-subscription)
      JSON.stringify({ category: 'Government & Tax', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' }),
    ])

    const seen = new Map<string, string>()
    for (const rule of MERCHANT_CATEGORY_RULES) {
      const key = JSON.stringify(rule.output)
      if (intentionalCollisions.has(key)) continue
      if (seen.has(key)) {
        throw new Error(
          `Unintentional fingerprint collision between "${seen.get(key)}" and "${rule.name}": ${key}`
        )
      }
      seen.set(key, rule.name)
    }
  })

  it('rules that match on ctx.isIncome always output an explicit isIncome value', () => {
    // Transfer rules that check ctx.isIncome as a gate condition are excluded —
    // for transfers the is_transfer flag is the authoritative classification;
    // the isIncome output field is irrelevant.
    const incomeMatchingRules = MERCHANT_CATEGORY_RULES.filter(r =>
      r.match.toString().includes('isIncome') && !r.output.isTransfer
    )
    for (const rule of incomeMatchingRules) {
      expect(rule.output.isIncome, `${rule.name} matches on isIncome but outputs null`).not.toBeNull()
    }
  })

  it('every rule category is null or a member of the canonical CATEGORIES set', () => {
    const validCategories = new Set<string>(CATEGORIES)
    for (const rule of MERCHANT_CATEGORY_RULES) {
      if (rule.output.category !== null) {
        expect(
          validCategories.has(rule.output.category),
          `Rule "${rule.name}" outputs category "${rule.output.category}" which is not in CATEGORIES`
        ).toBe(true)
      }
    }
  })
})
