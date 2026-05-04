import { describe, it, expect } from 'vitest'
import { classifyDirectorIncome, isDirectorIncome } from '../directorIncome'

describe('classifyDirectorIncome', () => {
  // -------------------------------------------------------------------------
  // Non-matching rows — should return match=false
  // -------------------------------------------------------------------------
  describe('non-matching rows', () => {
    it('returns match=false for zero amount', () => {
      expect(classifyDirectorIncome('NETBANK WAGE', 0).match).toBe(false)
    })

    it('returns match=false for negative amount (expense)', () => {
      expect(classifyDirectorIncome('NETBANK WAGE', -100).match).toBe(false)
    })

    it('returns match=false for excluded dir loan repayment', () => {
      expect(classifyDirectorIncome('DIR LOAN REPAY BHT', 5000).match).toBe(false)
    })

    it('returns match=false for unrelated income', () => {
      const result = classifyDirectorIncome('INTEREST CREDIT', 50)
      expect(result.match).toBe(false)
      expect(result.ruleName).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // SKIP_TRANSFER_FROM gate — personal-side "TRANSFER FROM XX####" descriptions
  // must NOT be classified as director income; the transfer linker handles them.
  // -------------------------------------------------------------------------
  describe('SKIP_TRANSFER_FROM gate', () => {
    it('returns match=false for "TRANSFER FROM XX5426 COMMBANK APP WAGE" (personal credit)', () => {
      const result = classifyDirectorIncome('TRANSFER FROM XX5426 COMMBANK APP WAGE', 4000)
      expect(result.match).toBe(false)
    })

    it('returns match=false for "TRANSFER FROM XX5426 COMMBANK APP" regardless of amount', () => {
      expect(classifyDirectorIncome('TRANSFER FROM XX5426 COMMBANK APP', 10000).match).toBe(false)
    })

    it('does NOT skip descriptions that merely contain "transfer from" mid-string', () => {
      // "NETBANK WAGE transfer from BHT" starts with "NETBANK WAGE" not "TRANSFER FROM XX"
      const result = classifyDirectorIncome('NETBANK WAGE transfer from BHT', 4000)
      expect(result.match).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // Wage patterns → category=Salary
  // -------------------------------------------------------------------------
  describe('wage patterns → Salary', () => {
    it('classifies NETBANK WAGE as Salary', () => {
      const result = classifyDirectorIncome('NETBANK WAGE 12345', 4000)
      expect(result.match).toBe(true)
      expect(result.category).toBe('Salary')
      expect(result.ruleName).toBe('director-income:netbank-wage')
    })

    it('classifies FIN WAGE as Salary', () => {
      const result = classifyDirectorIncome('FIN WAGE PAYMENT', 4000)
      expect(result.match).toBe(true)
      expect(result.category).toBe('Salary')
      expect(result.ruleName).toBe('director-income:fin-wage')
    })

    it('is case-insensitive for wage keyword', () => {
      const result = classifyDirectorIncome('netbank wage transfer', 4000)
      expect(result.match).toBe(true)
      expect(result.category).toBe('Salary')
    })

    it('detects wage anywhere in description', () => {
      const result = classifyDirectorIncome('MONTHLY WAGE NETBANK', 4000)
      // "MONTHLY WAGE NETBANK" — does it match director income patterns?
      // It contains "wage" but the description must also match DIRECTOR_INCOME_PATTERNS.
      // "MONTHLY WAGE" doesn't match netbank wage / fin wage / commbank app / payroll
      // So match should be false.
      expect(result.match).toBe(false)
    })

    it('classifies NETBANK WAGE regardless of surrounding text', () => {
      const result = classifyDirectorIncome('NETBANK WAGE BRISBANE HEALTH TECH', 4000)
      expect(result.match).toBe(true)
      expect(result.category).toBe('Salary')
    })
  })

  // -------------------------------------------------------------------------
  // Non-wage director income patterns → Director Income
  // -------------------------------------------------------------------------
  describe('non-wage patterns → Director Income', () => {
    it('classifies COMMBANK APP as Director Income', () => {
      const result = classifyDirectorIncome('COMMBANK APP TRANSFER', 10000)
      expect(result.match).toBe(true)
      expect(result.category).toBe('Director Income')
      expect(result.ruleName).toBe('director-income:commbank-app')
    })

    it('classifies PAYROLL (no wage keyword) as Director Income', () => {
      // "PAYROLL" matches director income patterns but "wage" does not appear
      const result = classifyDirectorIncome('PAYROLL CLEARING', 4000)
      expect(result.match).toBe(true)
      expect(result.category).toBe('Director Income')
      expect(result.ruleName).toBe('director-income:payroll')
    })
  })
})

// ---------------------------------------------------------------------------
// Legacy isDirectorIncome boolean helper
// ---------------------------------------------------------------------------
describe('isDirectorIncome (legacy boolean helper)', () => {
  it('returns true for matched director income', () => {
    expect(isDirectorIncome('NETBANK WAGE', 4000)).toBe(true)
  })

  it('returns false for non-matched description', () => {
    expect(isDirectorIncome('GROCERY STORE', 4000)).toBe(false)
  })

  it('returns false for negative amount', () => {
    expect(isDirectorIncome('NETBANK WAGE', -4000)).toBe(false)
  })
})
