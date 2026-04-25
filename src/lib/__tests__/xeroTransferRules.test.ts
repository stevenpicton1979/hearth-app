import { describe, it, expect } from 'vitest'
import {
  applyXeroTransferRules,
  extractDestinationSuffix,
  type XeroTransferContext,
} from '../xeroTransferRules'

// ---------------------------------------------------------------------------
// Helper to build a minimal context
// ---------------------------------------------------------------------------
function ctx(overrides: Partial<XeroTransferContext> = {}): XeroTransferContext {
  return {
    narration: '',
    reference: '',
    destinationAccount: null,
    suffixPresentButUnmatched: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// extractDestinationSuffix
// ---------------------------------------------------------------------------
describe('extractDestinationSuffix', () => {
  it('extracts suffix after "to" — lowercase', () => {
    expect(extractDestinationSuffix('wage Transfer to xx5426')).toBe('XX5426')
  })

  it('extracts suffix after "TO" — uppercase', () => {
    expect(extractDestinationSuffix('TRANSFER TO 1234')).toBe('1234')
  })

  it('extracts last-4-digit card suffix', () => {
    expect(extractDestinationSuffix('Transfer to 9876')).toBe('9876')
  })

  it('returns null when no "to SUFFIX" pattern found', () => {
    expect(extractDestinationSuffix('SALARY FROM BHT')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractDestinationSuffix('')).toBeNull()
  })

  it('ignores short tokens under 4 chars', () => {
    // "to AB" — 2 chars — should not match
    expect(extractDestinationSuffix('Transfer to AB')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Rule 1 — Business credit card payoff
// ---------------------------------------------------------------------------
describe('Rule 1 — business card payoff', () => {
  it('returns is_transfer=true for business-scoped destination', () => {
    const result = applyXeroTransferRules(ctx({
      narration: 'Transfer to 9876',
      destinationAccount: { scope: 'business', owner: 'Business' },
    }))
    expect(result.is_transfer).toBe(true)
    expect(result.needs_review).toBe(false)
    expect(result.ruleName).toBe('business-card-payoff')
  })

  it('takes precedence over wage keyword', () => {
    // Unlikely in practice, but Rule 1 should win if destination is business
    const result = applyXeroTransferRules(ctx({
      narration: 'wage Transfer to 9876',
      destinationAccount: { scope: 'business', owner: 'Business' },
    }))
    expect(result.ruleName).toBe('business-card-payoff')
    expect(result.is_transfer).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Rule 2 — Personal wage (Steven / Nicola / Joint)
// ---------------------------------------------------------------------------
describe('Rule 2 — personal wage', () => {
  it('classifies Steven wage correctly', () => {
    const result = applyXeroTransferRules(ctx({
      narration: 'WAGE TRANSFER TO XX5426',
      destinationAccount: { scope: 'household', owner: 'Steven' },
    }))
    expect(result.is_transfer).toBe(false)
    expect(result.category).toBe('Salary')
    expect(result.needs_review).toBe(false)
    expect(result.ruleName).toBe('personal-wage')
  })

  it('classifies Nicola wage correctly', () => {
    const result = applyXeroTransferRules(ctx({
      narration: 'wage transfer to YY1234',
      destinationAccount: { scope: 'household', owner: 'Nicola' },
    }))
    expect(result.category).toBe('Salary')
    expect(result.ruleName).toBe('personal-wage')
  })

  it('classifies Joint account wage correctly', () => {
    const result = applyXeroTransferRules(ctx({
      narration: 'wage transfer to ZZ0001',
      destinationAccount: { scope: 'household', owner: 'Joint' },
    }))
    expect(result.category).toBe('Salary')
    expect(result.ruleName).toBe('personal-wage')
  })

  it('matches wage in reference field too', () => {
    const result = applyXeroTransferRules(ctx({
      narration: 'Transfer to XX5426',
      reference: 'Monthly Wage',
      destinationAccount: { scope: 'household', owner: 'Steven' },
    }))
    expect(result.category).toBe('Salary')
    expect(result.ruleName).toBe('personal-wage')
  })

  it('is case-insensitive for wage keyword', () => {
    const result = applyXeroTransferRules(ctx({
      narration: 'WAGE payment to XX5426',
      destinationAccount: { scope: 'household', owner: 'Steven' },
    }))
    expect(result.category).toBe('Salary')
  })
})

// ---------------------------------------------------------------------------
// Rule 3 — Sons' wages (no matching Hearth account)
// ---------------------------------------------------------------------------
describe('Rule 3 — sons wages', () => {
  it('classifies external wage as Payroll Expense', () => {
    const result = applyXeroTransferRules(ctx({
      narration: 'wage transfer to 0001',
      destinationAccount: null,
      suffixPresentButUnmatched: true,
    }))
    expect(result.is_transfer).toBe(false)
    expect(result.category).toBe('Payroll Expense')
    expect(result.needs_review).toBe(false)
    expect(result.ruleName).toBe('sons-wages')
  })

  it('classifies external wage even when suffix not in text', () => {
    // No suffix found, no matched account → sons wages
    const result = applyXeroTransferRules(ctx({
      narration: 'wage payment',
      destinationAccount: null,
      suffixPresentButUnmatched: false,
    }))
    expect(result.category).toBe('Payroll Expense')
    expect(result.ruleName).toBe('sons-wages')
  })
})

// ---------------------------------------------------------------------------
// Rule 4 — Director drawings
// ---------------------------------------------------------------------------
describe('Rule 4 — director drawings', () => {
  it('classifies transfer to Steven without wage as Director Income', () => {
    const result = applyXeroTransferRules(ctx({
      narration: 'TRANSFER TO XX5426',
      destinationAccount: { scope: 'household', owner: 'Steven' },
    }))
    expect(result.is_transfer).toBe(false)
    expect(result.category).toBe('Director Income')
    expect(result.needs_review).toBe(false)
    expect(result.ruleName).toBe('director-drawings')
  })

  it('classifies transfer to Nicola without wage as Director Income', () => {
    const result = applyXeroTransferRules(ctx({
      narration: 'Transfer to YY1234',
      destinationAccount: { scope: 'household', owner: 'Nicola' },
    }))
    expect(result.category).toBe('Director Income')
    expect(result.ruleName).toBe('director-drawings')
  })
})

// ---------------------------------------------------------------------------
// Rule 5 — Unmatched transfer (suffix present, no account)
// ---------------------------------------------------------------------------
describe('Rule 5 — unmatched transfer', () => {
  it('flags for review when suffix unmatched and no wage', () => {
    const result = applyXeroTransferRules(ctx({
      narration: 'Transfer to 9999',
      destinationAccount: null,
      suffixPresentButUnmatched: true,
    }))
    expect(result.is_transfer).toBe(true)
    expect(result.needs_review).toBe(true)
    expect(result.ruleName).toBe('unmatched-transfer')
  })
})

// ---------------------------------------------------------------------------
// Rule 6 — Default
// ---------------------------------------------------------------------------
describe('Rule 6 — default', () => {
  it('classifies unknown transaction as Business expense', () => {
    const result = applyXeroTransferRules(ctx({
      narration: 'OFFICE SUPPLIES',
    }))
    expect(result.is_transfer).toBe(false)
    expect(result.category).toBe('Business')
    expect(result.needs_review).toBe(false)
    expect(result.ruleName).toBe('default')
  })

  it('treats transaction with no suffix and no wage as default', () => {
    const result = applyXeroTransferRules(ctx({
      narration: 'Director payment',
      destinationAccount: null,
      suffixPresentButUnmatched: false,
    }))
    expect(result.ruleName).toBe('default')
  })
})
