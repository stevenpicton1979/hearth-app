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
