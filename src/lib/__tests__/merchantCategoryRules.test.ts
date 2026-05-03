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
    expect(applyMerchantCategoryRules('RANDOM STORE XYZ', expense)).toBeNull()
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
    expect(applyMerchantCategoryRules('RANDOM STORE XYZ', income)).toBeNull()
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


// ─── commbank_internal_transfer ───────────────────────────────────────────────

describe('commbank_internal_transfer', () => {
  it('matches "TRANSFER FROM XX2961 COMMBANK APP" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('TRANSFER FROM XX2961 COMMBANK APP', expense)
    expect(result?.category).toBeNull()
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(true)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBeNull()
    expect(result?.ruleName).toBe('commbank_internal_transfer')
  })

  it('matches NETBANK WAGE variant', () => {
    expect(applyMerchantCategoryRules('TRANSFER FROM XX2961 NETBANK WAGE', income)?.ruleName).toBe('commbank_internal_transfer')
  })

  it('matches different account suffix XX5811', () => {
    expect(applyMerchantCategoryRules('TRANSFER FROM XX5811 COMMBANK APP', expense)?.ruleName).toBe('commbank_internal_transfer')
  })

  it('matches FUEL suffix variant', () => {
    expect(applyMerchantCategoryRules('TRANSFER FROM XX2961 COMMBANK APP FUEL', expense)?.ruleName).toBe('commbank_internal_transfer')
  })

  it('does NOT match "TRANSFER FROM EMPLOYER PTY LTD"', () => {
    expect(applyMerchantCategoryRules('TRANSFER FROM EMPLOYER PTY LTD', income)?.ruleName).not.toBe('commbank_internal_transfer')
  })
})

// ─── aldi ─────────────────────────────────────────────────────────────────────

describe('aldi', () => {
  it('matches "ALDI STORES" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('ALDI STORES', expense)
    expect(result?.category).toBe('Groceries')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('aldi')
  })

  it('matches "ALDI MOUNT GRAVATT"', () => {
    expect(applyMerchantCategoryRules('ALDI MOUNT GRAVATT', expense)?.ruleName).toBe('aldi')
  })
})

// ─── woolworths ───────────────────────────────────────────────────────────────

describe('woolworths', () => {
  it('matches "WOOLWORTHS" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('WOOLWORTHS', expense)
    expect(result?.category).toBe('Groceries')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('woolworths')
  })

  it('matches "WOOLWORTHS 2560"', () => {
    expect(applyMerchantCategoryRules('WOOLWORTHS 2560', expense)?.ruleName).toBe('woolworths')
  })
})

// ─── coles ────────────────────────────────────────────────────────────────────

describe('coles', () => {
  it('matches "COLES 4574" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('COLES 4574', expense)
    expect(result?.category).toBe('Groceries')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('coles')
  })

  it('matches "COLES ONLINE"', () => {
    expect(applyMerchantCategoryRules('COLES ONLINE', expense)?.ruleName).toBe('coles')
  })

  it('matches bare "COLES"', () => {
    expect(applyMerchantCategoryRules('COLES', expense)?.ruleName).toBe('coles')
  })
})

// ─── iga ──────────────────────────────────────────────────────────────────────

describe('iga', () => {
  it('matches "IGA LOCAL GROCER" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('IGA LOCAL GROCER', expense)
    expect(result?.category).toBe('Groceries')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('iga')
  })

  it("matches \"CHRIS' IGA CARINA\"", () => {
    expect(applyMerchantCategoryRules("CHRIS' IGA CARINA", expense)?.ruleName).toBe('iga')
  })
})

// ─── the_source_bulk_foods ────────────────────────────────────────────────────

describe('the_source_bulk_foods', () => {
  it('matches "THE SOURCE BULK FOODS" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('THE SOURCE BULK FOODS', expense)
    expect(result?.category).toBe('Groceries')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('the_source_bulk_foods')
  })
})

// ─── hanaro_trading ───────────────────────────────────────────────────────────

describe('hanaro_trading', () => {
  it('matches "HANARO TRADING PTY LTD" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('HANARO TRADING PTY LTD', expense)
    expect(result?.category).toBe('Food & Groceries')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('hanaro_trading')
  })
})

// ─── little_genovese ──────────────────────────────────────────────────────────

describe('little_genovese', () => {
  it('matches "LITTLE GENOVESE" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('LITTLE GENOVESE', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('little_genovese')
  })
})

// ─── guzman_y_gomez ───────────────────────────────────────────────────────────

describe('guzman_y_gomez', () => {
  it('matches "GUZMAN Y GOMEZ" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('GUZMAN Y GOMEZ', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('guzman_y_gomez')
  })
})

// ─── kfc ──────────────────────────────────────────────────────────────────────

describe('kfc', () => {
  it('matches "KFC CARINDALE" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('KFC CARINDALE', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('kfc')
  })

  it('matches "KFC REDCLIFFE"', () => {
    expect(applyMerchantCategoryRules('KFC REDCLIFFE', expense)?.ruleName).toBe('kfc')
  })
})

// ─── mcdonalds ────────────────────────────────────────────────────────────────

describe('mcdonalds', () => {
  it('matches "MCDONALDS CARINA HEI" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('MCDONALDS CARINA HEI', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('mcdonalds')
  })

  it('matches "MCDONALDS MOUNT GRAVATT"', () => {
    expect(applyMerchantCategoryRules('MCDONALDS MOUNT GRAVATT', expense)?.ruleName).toBe('mcdonalds')
  })
})

// ─── old_mr_rabbit ────────────────────────────────────────────────────────────

describe('old_mr_rabbit', () => {
  it('matches "OLD MR RABBIT" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('OLD MR RABBIT', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('old_mr_rabbit')
  })
})

// ─── asian_delights ───────────────────────────────────────────────────────────

describe('asian_delights', () => {
  it('matches "ASIAN DELIGHTS CARINDA" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('ASIAN DELIGHTS CARINDA', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('asian_delights')
  })
})

// ─── rivercity_catering ───────────────────────────────────────────────────────

describe('rivercity_catering', () => {
  it('matches "SQ *RIVERCITY CATERING" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('SQ *RIVERCITY CATERING', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('rivercity_catering')
  })
})

// ─── dicky_beach_seafood ──────────────────────────────────────────────────────

describe('dicky_beach_seafood', () => {
  it('matches "SQ *DICKY BEACH SEAFOO" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('SQ *DICKY BEACH SEAFOO', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('dicky_beach_seafood')
  })
})

// ─── carina_med_spec ──────────────────────────────────────────────────────────

describe('carina_med_spec', () => {
  it('matches "CARINA MED & SPEC" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('CARINA MED & SPEC', expense)
    expect(result?.category).toBe('Healthcare')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('carina_med_spec')
  })
})

// ─── metropol_pharmacy ────────────────────────────────────────────────────────

describe('metropol_pharmacy', () => {
  it('matches "METROPOL PHARMACY" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('METROPOL PHARMACY', expense)
    expect(result?.category).toBe('Healthcare')
    expect(result?.ruleName).toBe('metropol_pharmacy')
  })
})

// ─── medibank_private ─────────────────────────────────────────────────────────

describe('medibank_private', () => {
  it('matches "DIRECT CREDIT 361748 MEDIBANK PRIVATE" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('DIRECT CREDIT 361748 MEDIBANK PRIVATE', income)
    expect(result?.category).toBe('Insurance')
    expect(result?.isIncome).toBeNull()
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('medibank_private')
  })
})

// ─── carindale_vet ────────────────────────────────────────────────────────────

describe('carindale_vet', () => {
  it('matches "CARINDALE VET" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('CARINDALE VET', expense)
    expect(result?.category).toBe('Pets')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('carindale_vet')
  })
})

// ─── target ───────────────────────────────────────────────────────────────────

describe('target', () => {
  it('matches "TARGET 5233" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('TARGET 5233', expense)
    expect(result?.category).toBe('Shopping')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('target')
  })

  it('matches bare "TARGET"', () => {
    expect(applyMerchantCategoryRules('TARGET', expense)?.ruleName).toBe('target')
  })
})

// ─── myer ─────────────────────────────────────────────────────────────────────

describe('myer', () => {
  it('matches "MYER  CARINDALE" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('MYER  CARINDALE', expense)
    expect(result?.category).toBe('Shopping')
    expect(result?.ruleName).toBe('myer')
  })
})

// ─── the_reject_shop ──────────────────────────────────────────────────────────

describe('the_reject_shop', () => {
  it('matches "THE REJECT SHOP" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('THE REJECT SHOP', expense)
    expect(result?.category).toBe('Shopping')
    expect(result?.ruleName).toBe('the_reject_shop')
  })
})

// ─── hubbl_binge ──────────────────────────────────────────────────────────────

describe('hubbl_binge', () => {
  it('matches "HUBBL - BINGE" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('HUBBL - BINGE', expense)
    expect(result?.category).toBe('Entertainment')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(true)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('hubbl_binge')
  })
})

// ─── mater_lotteries ──────────────────────────────────────────────────────────

describe('mater_lotteries', () => {
  it('matches "MATER LOTTERIES" — full fingerprint', () => {
    const result = applyMerchantCategoryRules('MATER LOTTERIES', expense)
    expect(result?.category).toBe('Entertainment')
    expect(result?.isIncome).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('mater_lotteries')
  })
})

// ─── Batch 3 rules ───────────────────────────────────────────────────────────

describe('fuel_freedom_fuels', () => {
  it('matches "FREEDOM FUELS (MT GRAVATT PLAZA)"', () => {
    const result = applyMerchantCategoryRules('FREEDOM FUELS (MT GRAVATT PLAZA)', expense)
    expect(result?.category).toBe('Transport')
    expect(result?.isIncome).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('fuel_freedom_fuels')
  })
})

describe('fuel_shell_coles_express', () => {
  it('matches "SHELL COLES EXPRESS (ROCKLEA)"', () => {
    const result = applyMerchantCategoryRules('SHELL COLES EXPRESS (ROCKLEA)', expense)
    expect(result?.category).toBe('Transport')
    expect(result?.isIncome).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('fuel_shell_coles_express')
  })

  it('matches "SHELL COLES EXPRESS (ALEXANDRA HILLS)"', () => {
    const result = applyMerchantCategoryRules('SHELL COLES EXPRESS (ALEXANDRA HILLS)', expense)
    expect(result?.ruleName).toBe('fuel_shell_coles_express')
  })
})

describe('fuel_bp', () => {
  it('matches "BP (CABOOLTURE)"', () => {
    const result = applyMerchantCategoryRules('BP (CABOOLTURE)', expense)
    expect(result?.category).toBe('Transport')
    expect(result?.ruleName).toBe('fuel_bp')
  })

  it('matches "BP EXP CARINDALE 1414"', () => {
    const result = applyMerchantCategoryRules('BP EXP CARINDALE 1414', expense)
    expect(result?.ruleName).toBe('fuel_bp')
  })
})

describe('fuel_ampol', () => {
  it('matches "AMPOL CAMP HILL"', () => {
    const result = applyMerchantCategoryRules('AMPOL CAMP HILL', expense)
    expect(result?.category).toBe('Transport')
    expect(result?.ruleName).toBe('fuel_ampol')
  })
})

describe('kmart', () => {
  it('matches "KMART 1013"', () => {
    const result = applyMerchantCategoryRules('KMART 1013', expense)
    expect(result?.category).toBe('Shopping')
    expect(result?.isIncome).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('kmart')
  })

  it('matches "KMART 1067"', () => {
    const result = applyMerchantCategoryRules('KMART 1067', expense)
    expect(result?.ruleName).toBe('kmart')
  })

  it('does not match bare "KMART" without suffix', () => {
    // Bare KMART without number/space won't match /^kmart[\s\d]/
    expect(applyMerchantCategoryRules('KMART', expense)?.ruleName).not.toBe('kmart')
  })
})

describe('bunnings', () => {
  it('matches "BUNNINGS (MT GRAVATT)"', () => {
    const result = applyMerchantCategoryRules('BUNNINGS (MT GRAVATT)', expense)
    expect(result?.category).toBe('Shopping')
    expect(result?.ruleName).toBe('bunnings')
  })

  it('matches "BUNNINGS (LOGAN ROAD MT GRAVATT)"', () => {
    const result = applyMerchantCategoryRules('BUNNINGS (LOGAN ROAD MT GRAVATT)', expense)
    expect(result?.ruleName).toBe('bunnings')
  })
})

describe('tk_maxx', () => {
  it('matches "TK MAXX CANNON HILL"', () => {
    const result = applyMerchantCategoryRules('TK MAXX CANNON HILL', expense)
    expect(result?.category).toBe('Shopping')
    expect(result?.ruleName).toBe('tk_maxx')
  })
})

describe('spotlight_retail', () => {
  it('matches "SPOTLIGHT CARINDALE"', () => {
    const result = applyMerchantCategoryRules('SPOTLIGHT CARINDALE', expense)
    expect(result?.category).toBe('Shopping')
    expect(result?.ruleName).toBe('spotlight_retail')
  })
})

describe('super_cheap_auto', () => {
  it('matches "SUPER CHEAP AUTO (MOUNT GRAVATT)"', () => {
    const result = applyMerchantCategoryRules('SUPER CHEAP AUTO (MOUNT GRAVATT)', expense)
    expect(result?.category).toBe('Shopping')
    expect(result?.ruleName).toBe('super_cheap_auto')
  })
})

describe('the_trail_co', () => {
  it('matches "THE TRAIL CO PTY LTD"', () => {
    const result = applyMerchantCategoryRules('THE TRAIL CO PTY LTD', expense)
    expect(result?.category).toBe('Shopping')
    expect(result?.ruleName).toBe('the_trail_co')
  })
})

describe('reebelo_australia', () => {
  it('matches "REEBELO AUSTRALIA"', () => {
    const result = applyMerchantCategoryRules('REEBELO AUSTRALIA', expense)
    expect(result?.category).toBe('Shopping')
    expect(result?.ruleName).toBe('reebelo_australia')
  })
})

describe('event_cinemas', () => {
  it('matches "EVENT GARDEN CITY"', () => {
    const result = applyMerchantCategoryRules('EVENT GARDEN CITY', expense)
    expect(result?.category).toBe('Entertainment')
    expect(result?.isIncome).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('event_cinemas')
  })
})

describe('birch_carroll_cinemas', () => {
  it('matches "BIRCH CARROLL & COYL"', () => {
    const result = applyMerchantCategoryRules('BIRCH CARROLL & COYL', expense)
    expect(result?.category).toBe('Entertainment')
    expect(result?.ruleName).toBe('birch_carroll_cinemas')
  })
})

describe('tatts_online', () => {
  it('matches "TATTS ONLINE PTY LTD"', () => {
    const result = applyMerchantCategoryRules('TATTS ONLINE PTY LTD', expense)
    expect(result?.category).toBe('Entertainment')
    expect(result?.ruleName).toBe('tatts_online')
  })
})

describe('plaster_fun_house', () => {
  it('matches "SQ *PLASTER FUN HOUSE" — before sq_eating_out catch-all', () => {
    const result = applyMerchantCategoryRules('SQ *PLASTER FUN HOUSE', expense)
    expect(result?.category).toBe('Entertainment')
    expect(result?.ruleName).toBe('plaster_fun_house')
  })
})

describe('specsavers_optometrist', () => {
  it('matches "SPECSAVERS OPTOMETRIST"', () => {
    const result = applyMerchantCategoryRules('SPECSAVERS OPTOMETRIST', expense)
    expect(result?.category).toBe('Healthcare')
    expect(result?.isIncome).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('specsavers_optometrist')
  })
})

describe('burst_health', () => {
  it('matches "BURST HEALTH"', () => {
    const result = applyMerchantCategoryRules('BURST HEALTH', expense)
    expect(result?.category).toBe('Healthcare')
    expect(result?.ruleName).toBe('burst_health')
  })
})

describe('scope_psychology', () => {
  it('matches "SCOPE PSYCHOLOGY"', () => {
    const result = applyMerchantCategoryRules('SCOPE PSYCHOLOGY', expense)
    expect(result?.category).toBe('Healthcare')
    expect(result?.ruleName).toBe('scope_psychology')
  })
})

describe('queensland_xray', () => {
  it('matches "QUEENSLAND X-RAY"', () => {
    const result = applyMerchantCategoryRules('QUEENSLAND X-RAY', expense)
    expect(result?.category).toBe('Healthcare')
    expect(result?.ruleName).toBe('queensland_xray')
  })
})

describe('mater_misericordiae_hospital', () => {
  it('matches "MATER MISERICORDIAE"', () => {
    const result = applyMerchantCategoryRules('MATER MISERICORDIAE', expense)
    expect(result?.category).toBe('Healthcare')
    expect(result?.ruleName).toBe('mater_misericordiae_hospital')
  })
})

describe('mh_carindale_hospital', () => {
  it('matches "MH CARINDALE"', () => {
    const result = applyMerchantCategoryRules('MH CARINDALE', expense)
    expect(result?.category).toBe('Healthcare')
    expect(result?.ruleName).toBe('mh_carindale_hospital')
  })
})

describe('zen_hair_skin_body', () => {
  it('matches "ZEN HAIR SKIN & BODY" → Personal Care', () => {
    const result = applyMerchantCategoryRules('ZEN HAIR SKIN & BODY', expense)
    expect(result?.category).toBe('Personal Care')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('zen_hair_skin_body')
  })
})

describe('gold_coast_aquatics', () => {
  it('matches "GOLD COAST AQUATI REC1"', () => {
    const result = applyMerchantCategoryRules('GOLD COAST AQUATI REC1', expense)
    expect(result?.category).toBe('Health & Fitness')
    expect(result?.isIncome).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('gold_coast_aquatics')
  })
})

describe('diving_queensland', () => {
  it('matches "PIN* DIVING QUEENSLAND"', () => {
    const result = applyMerchantCategoryRules('PIN* DIVING QUEENSLAND', expense)
    expect(result?.category).toBe('Health & Fitness')
    expect(result?.ruleName).toBe('diving_queensland')
  })
})

describe('secure_parking', () => {
  it('matches "SECURE PARKING"', () => {
    const result = applyMerchantCategoryRules('SECURE PARKING', expense)
    expect(result?.category).toBe('Transport')
    expect(result?.ruleName).toBe('secure_parking')
  })
})

describe('booking_com_hotel', () => {
  it('matches "HOTEL AT BOOKING.COM" → Travel', () => {
    const result = applyMerchantCategoryRules('HOTEL AT BOOKING.COM', expense)
    expect(result?.category).toBe('Travel')
    expect(result?.isIncome).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('booking_com_hotel')
  })
})

describe('liquorland', () => {
  it('matches "LIQUORLAND 6684"', () => {
    const result = applyMerchantCategoryRules('LIQUORLAND 6684', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.isIncome).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('liquorland')
  })

  it('matches "LIQUORLAND 6127"', () => {
    const result = applyMerchantCategoryRules('LIQUORLAND 6127', expense)
    expect(result?.ruleName).toBe('liquorland')
  })
})

describe('hurrikane_cafe', () => {
  it('matches "HURRIKANE PTY LTD"', () => {
    const result = applyMerchantCategoryRules('HURRIKANE PTY LTD', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.isIncome).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('hurrikane_cafe')
  })
})

describe('sq_eating_out', () => {
  it('matches "SQ *THE SANCTUARY CAFE" — Square terminal catch-all', () => {
    const result = applyMerchantCategoryRules('SQ *THE SANCTUARY CAFE', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('sq_eating_out')
  })

  it('matches "SQ *YOON SUSHI"', () => {
    const result = applyMerchantCategoryRules('SQ *YOON SUSHI', expense)
    expect(result?.ruleName).toBe('sq_eating_out')
  })

  it('does not match plaster_fun_house (earlier rule wins)', () => {
    const result = applyMerchantCategoryRules('SQ *PLASTER FUN HOUSE', expense)
    expect(result?.ruleName).toBe('plaster_fun_house')
  })
})

describe('zlr_eating_out', () => {
  it('matches "ZLR*THE SHIP INN" — Zeller terminal catch-all', () => {
    const result = applyMerchantCategoryRules('ZLR*THE SHIP INN', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('zlr_eating_out')
  })

  it('matches "ZLR*THE CHEESECAKE SHO"', () => {
    const result = applyMerchantCategoryRules('ZLR*THE CHEESECAKE SHO', expense)
    expect(result?.ruleName).toBe('zlr_eating_out')
  })
})

describe('bakers_delight', () => {
  it('matches "BAKERS DELIGHT"', () => {
    const result = applyMerchantCategoryRules('BAKERS DELIGHT', expense)
    expect(result?.category).toBe('Food & Groceries')
    expect(result?.ruleName).toBe('bakers_delight')
  })
})

describe('dept_education_qld', () => {
  it('matches "DEPARTMENT OF EDUCATIO" (truncated CBA description)', () => {
    const result = applyMerchantCategoryRules('DEPARTMENT OF EDUCATIO', expense)
    expect(result?.category).toBe('Education')
    expect(result?.isIncome).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('dept_education_qld')
  })
})

describe('budget_direct_rebate', () => {
  it('matches "DIRECT CREDIT 395135 BUDGET DIRECT" — income', () => {
    const result = applyMerchantCategoryRules('DIRECT CREDIT 395135 BUDGET DIRECT', income)
    expect(result?.category).toBe('Insurance')
    expect(result?.isIncome).toBe(true)
    expect(result?.isTransfer).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('budget_direct_rebate')
  })
})

describe('mcare_benefits_income', () => {
  it('matches "DIRECT CREDIT 002221 MCARE BENEFITS 263124214 EYWQ" — income', () => {
    const result = applyMerchantCategoryRules('DIRECT CREDIT 002221 MCARE BENEFITS 263124214 EYWQ', income)
    expect(result?.category).toBe('Healthcare')
    expect(result?.isIncome).toBe(true)
    expect(result?.isTransfer).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('mcare_benefits_income')
  })
})


// ─── Batch 3 supplement rules ─────────────────────────────────────────────────

describe('etsy_shopping', () => {
  it('matches "ETSY.COM*ARBITRARYGIFT"', () => {
    const result = applyMerchantCategoryRules('ETSY.COM*ARBITRARYGIFT', expense)
    expect(result?.category).toBe('Shopping')
    expect(result?.ruleName).toBe('etsy_shopping')
  })
})

describe('two_xu_apparel', () => {
  it('matches "2XU PTY LTD"', () => {
    const result = applyMerchantCategoryRules('2XU PTY LTD', expense)
    expect(result?.category).toBe('Shopping')
    expect(result?.ruleName).toBe('two_xu_apparel')
  })
})

describe('fast_times_clothing', () => {
  it('matches "FAST TIMES"', () => {
    const result = applyMerchantCategoryRules('FAST TIMES', expense)
    expect(result?.category).toBe('Shopping')
    expect(result?.ruleName).toBe('fast_times_clothing')
  })
})

describe('ls_link_vision', () => {
  it('matches "LS LINK VISION LTD" → Healthcare', () => {
    const result = applyMerchantCategoryRules('LS LINK VISION LTD', expense)
    expect(result?.category).toBe('Healthcare')
    expect(result?.ruleName).toBe('ls_link_vision')
  })
})

describe('andys_bakery', () => {
  it("matches \"ANDY'S BAKERY WISHART\"", () => {
    const result = applyMerchantCategoryRules("ANDY'S BAKERY WISHART", expense)
    expect(result?.category).toBe('Food & Groceries')
    expect(result?.ruleName).toBe('andys_bakery')
  })
})

describe('kenrose_bakery', () => {
  it('matches "KENROSE STREET BAKERY"', () => {
    const result = applyMerchantCategoryRules('KENROSE STREET BAKERY', expense)
    expect(result?.category).toBe('Food & Groceries')
    expect(result?.ruleName).toBe('kenrose_bakery')
  })
})

describe('just_bun', () => {
  it('matches "JUST BUN"', () => {
    const result = applyMerchantCategoryRules('JUST BUN', expense)
    expect(result?.category).toBe('Food & Groceries')
    expect(result?.ruleName).toBe('just_bun')
  })
})

describe('nextra_newsagency', () => {
  it('matches "NEXTRA CARINDALE NEWS"', () => {
    const result = applyMerchantCategoryRules('NEXTRA CARINDALE NEWS', expense)
    expect(result?.category).toBe('Food & Groceries')
    expect(result?.ruleName).toBe('nextra_newsagency')
  })
})

describe('tomcat_bar', () => {
  it('matches "TOMCAT BAR"', () => {
    const result = applyMerchantCategoryRules('TOMCAT BAR', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('tomcat_bar')
  })
})

describe('satay_boss', () => {
  it('matches "SATAY BOSS"', () => {
    const result = applyMerchantCategoryRules('SATAY BOSS', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('satay_boss')
  })
})

describe('thai_antique', () => {
  it('matches "THAI ANTIQUE RESTAURA"', () => {
    const result = applyMerchantCategoryRules('THAI ANTIQUE RESTAURA', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('thai_antique')
  })
})

describe('sitar_restaurant', () => {
  it('matches "SITAR"', () => {
    const result = applyMerchantCategoryRules('SITAR', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('sitar_restaurant')
  })
})

describe('the_archive_bar', () => {
  it('matches "THE ARCHIVE"', () => {
    const result = applyMerchantCategoryRules('THE ARCHIVE', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('the_archive_bar')
  })
})

describe('bellissimo_coffee', () => {
  it('matches "BELLISSIMO COFFEE - CO"', () => {
    const result = applyMerchantCategoryRules('BELLISSIMO COFFEE - CO', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('bellissimo_coffee')
  })
})

describe('food_odyssey', () => {
  it('matches "FOOD ODYSSEY OPERATQPS"', () => {
    const result = applyMerchantCategoryRules('FOOD ODYSSEY OPERATQPS', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('food_odyssey')
  })
})

describe('ls_eating_out', () => {
  it('matches "LS BETWEEN THE FLAGS C" — Lightspeed cafe', () => {
    const result = applyMerchantCategoryRules('LS BETWEEN THE FLAGS C', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('ls_eating_out')
  })

  it('matches "LS SUPERNUMERARY COFFE"', () => {
    const result = applyMerchantCategoryRules('LS SUPERNUMERARY COFFE', expense)
    expect(result?.ruleName).toBe('ls_eating_out')
  })

  it('does NOT catch "LS LINK VISION LTD" (earlier named rule wins)', () => {
    const result = applyMerchantCategoryRules('LS LINK VISION LTD', expense)
    expect(result?.ruleName).toBe('ls_link_vision')
  })
})


// ─── Batch 4: Bank fees, utilities, remaining named merchants ────────────────

describe('cba_annual_fee', () => {
  it('matches "ANNUAL FEE" → Bank Fees', () => {
    const result = applyMerchantCategoryRules('ANNUAL FEE', expense)
    expect(result?.category).toBe('Bank Fees')
    expect(result?.isIncome).toBe(false)
    expect(result?.isTransfer).toBe(false)
    expect(result?.isSubscription).toBe(false)
    expect(result?.owner).toBe('Joint')
    expect(result?.ruleName).toBe('cba_annual_fee')
  })

  it('does NOT match "APPLE ANNUAL FEE" or other pre/suffixed variants', () => {
    expect(applyMerchantCategoryRules('APPLE ANNUAL FEE', expense)).toBeNull()
    expect(applyMerchantCategoryRules('ANNUAL FEE PROMO', expense)).toBeNull()
  })
})

describe('cba_interest_cash_adv', () => {
  it('matches "INTEREST ON CASH ADV" → Bank Fees', () => {
    const result = applyMerchantCategoryRules('INTEREST ON CASH ADV', expense)
    expect(result?.category).toBe('Bank Fees')
    expect(result?.ruleName).toBe('cba_interest_cash_adv')
  })

  it('matches with trailing context "INTEREST ON CASH ADVANCES"', () => {
    const result = applyMerchantCategoryRules('INTEREST ON CASH ADVANCES', expense)
    expect(result?.ruleName).toBe('cba_interest_cash_adv')
  })
})

describe('cba_cash_adv_fee', () => {
  it('matches "CBA OTHER CASH ADV FEE" → Bank Fees', () => {
    const result = applyMerchantCategoryRules('CBA OTHER CASH ADV FEE', expense)
    expect(result?.category).toBe('Bank Fees')
    expect(result?.ruleName).toBe('cba_cash_adv_fee')
  })

  it('matches generic "CASH ADV FEE"', () => {
    const result = applyMerchantCategoryRules('CASH ADV FEE', expense)
    expect(result?.ruleName).toBe('cba_cash_adv_fee')
  })
})

describe('momentum_energy', () => {
  it('matches "MOMENTUM" → Utilities', () => {
    const result = applyMerchantCategoryRules('MOMENTUM', expense)
    expect(result?.category).toBe('Utilities')
    expect(result?.owner).toBe('Joint')
    expect(result?.isSubscription).toBe(false)
    expect(result?.ruleName).toBe('momentum_energy')
  })

  it('matches "MOMENTUM ENERGY"', () => {
    const result = applyMerchantCategoryRules('MOMENTUM ENERGY', expense)
    expect(result?.ruleName).toBe('momentum_energy')
  })

  it('does NOT match "MOMENTUM WEALTH" or similar', () => {
    expect(applyMerchantCategoryRules('MOMENTUM WEALTH MGMT', expense)).toBeNull()
  })
})

describe('crisp_on_creek', () => {
  it('matches "CRISPONCREEK" → Eating Out', () => {
    const result = applyMerchantCategoryRules('CRISPONCREEK', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('crisp_on_creek')
  })
})

describe('north_burleigh_surf_club', () => {
  it('matches "NORTH BURLEIGH SURF LI" → Eating Out', () => {
    const result = applyMerchantCategoryRules('NORTH BURLEIGH SURF LI', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('north_burleigh_surf_club')
  })
})

describe('hanaichi_sushi', () => {
  it('matches "HANAICHI PTY LTD" → Eating Out', () => {
    const result = applyMerchantCategoryRules('HANAICHI PTY LTD', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('hanaichi_sushi')
  })

  it('matches plain "HANAICHI"', () => {
    const result = applyMerchantCategoryRules('HANAICHI', expense)
    expect(result?.ruleName).toBe('hanaichi_sushi')
  })
})

describe('hira_bhana_sons', () => {
  it('matches "HIRA BHANA & SONS" → Eating Out', () => {
    const result = applyMerchantCategoryRules('HIRA BHANA & SONS', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('hira_bhana_sons')
  })
})

describe('river_city_corporation', () => {
  it('matches "RIVER CITY CORPORATI" (truncated) → Eating Out', () => {
    const result = applyMerchantCategoryRules('RIVER CITY CORPORATI', expense)
    expect(result?.category).toBe('Eating Out')
    expect(result?.ruleName).toBe('river_city_corporation')
  })

  it('matches full "RIVER CITY CORPORATION"', () => {
    const result = applyMerchantCategoryRules('RIVER CITY CORPORATION', expense)
    expect(result?.ruleName).toBe('river_city_corporation')
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
      // bht_directors_loan_transfer, director_loan_repayment, commbank_internal_transfer — inter-account transfers
      JSON.stringify({ category: null, isIncome: null, isTransfer: true, isSubscription: false, owner: null }),
      // xbox, spotify — both Entertainment subscriptions on the BHT account
      JSON.stringify({ category: 'Entertainment', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' }),
      // fitness_passport, fitstop, fitbox — all Joint Health & Fitness subscriptions
      JSON.stringify({ category: 'Health & Fitness', isIncome: false, isTransfer: false, isSubscription: true, owner: 'Joint' }),
      // hcf_health_insurance, hospitals_contribution, clearview_insurance — all Joint Insurance subscriptions
      JSON.stringify({ category: 'Insurance', isIncome: false, isTransfer: false, isSubscription: true, owner: 'Joint' }),
      // brisbane_city_council, bcc_rates, qld_transport_rego — all Joint Government & Tax (non-subscription)
      JSON.stringify({ category: 'Government & Tax', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' }),
      // aldi, woolworths, coles, iga, the_source_bulk_foods — all Joint Groceries
      JSON.stringify({ category: 'Groceries', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' }),
      // the_bread_corner, hanaro_trading — Joint Food & Groceries
      JSON.stringify({ category: 'Food & Groceries', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' }),
      // mansfield_state_high + eating out rules — all Joint Eating Out
      JSON.stringify({ category: 'Eating Out', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' }),
      // carina_med_spec, metropol_pharmacy — all Joint Healthcare
      JSON.stringify({ category: 'Healthcare', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' }),
      // target, myer, the_reject_shop, kmart, bunnings, tk_maxx, etc. — all Joint Shopping
      JSON.stringify({ category: 'Shopping', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' }),
      // fuel rules, secure_parking — all Joint Transport non-subscription expenses
      JSON.stringify({ category: 'Transport', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' }),
      // event_cinemas, birch_carroll, tatts_online, plaster_fun_house, mater_lotteries — all Joint Entertainment
      JSON.stringify({ category: 'Entertainment', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' }),
      // specsavers, burst_health, scope_psychology, queensland_xray, mater, mh_carindale — all Joint Healthcare
      // (non-income; mcare_benefits_income has isIncome:true so different fingerprint)
      JSON.stringify({ category: 'Healthcare', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' }),
      // gold_coast_aquatics, diving_queensland — Joint Health & Fitness non-subscription
      JSON.stringify({ category: 'Health & Fitness', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' }),
      // cba_annual_fee, cba_interest_cash_adv, cba_cash_adv_fee — all Joint Bank Fees
      JSON.stringify({ category: 'Bank Fees', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' }),
      // qld_urban_utilities, momentum_energy — Joint Utilities
      JSON.stringify({ category: 'Utilities', isIncome: false, isTransfer: false, isSubscription: false, owner: 'Joint' }),
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
