import { describe, it, expect } from 'vitest'
import {
  fyForDate,
  fyDateRange,
  fyLabel,
  payloadFor,
  REVERT_PAYLOAD,
  classificationFromMatchedRule,
  isYearEndClassification,
  CLASSIFICATION_LABELS,
  YEAR_END_CLASSIFICATIONS,
} from '@/lib/yearEnd'

describe('fyForDate', () => {
  it('treats 30 June as the last day of the FY', () => {
    expect(fyForDate('2025-06-30')).toBe(2025)
  })

  it('treats 1 July as the first day of the next FY', () => {
    expect(fyForDate('2025-07-01')).toBe(2026)
  })

  it('mid-FY: May 2026 is FY2026', () => {
    expect(fyForDate('2026-05-17')).toBe(2026)
  })

  it('1 July of a later year rolls to the next FY', () => {
    expect(fyForDate('2026-07-01')).toBe(2027)
  })

  it('January is still in the FY of its calendar year', () => {
    expect(fyForDate('2026-01-15')).toBe(2026)
  })
})

describe('fyDateRange', () => {
  it('FY2026 spans 2025-07-01 to 2026-06-30', () => {
    expect(fyDateRange(2026)).toEqual({ startDate: '2025-07-01', endDate: '2026-06-30' })
  })

  it('FY2025 spans 2024-07-01 to 2025-06-30', () => {
    expect(fyDateRange(2025)).toEqual({ startDate: '2024-07-01', endDate: '2025-06-30' })
  })

  it('round-trips via fyForDate on startDate', () => {
    const fy = 2026
    const { startDate } = fyDateRange(fy)
    expect(fyForDate(startDate)).toBe(fy)
  })

  it('round-trips via fyForDate on endDate', () => {
    const fy = 2026
    const { endDate } = fyDateRange(fy)
    expect(fyForDate(endDate)).toBe(fy)
  })
})

describe('fyLabel', () => {
  it('formats FY2026 as "FY2026 (Jul 2025 – Jun 2026)"', () => {
    expect(fyLabel(2026)).toBe('FY2026 (Jul 2025 – Jun 2026)')
  })
})

describe('payloadFor', () => {
  it('director-income-steven sets Steven as income earner', () => {
    expect(payloadFor('director-income-steven')).toEqual({
      category: 'Director Income',
      owner: 'Steven',
      is_income: true,
      is_transfer: false,
      is_provisional: false,
      matched_rule: 'year-end:director-income:steven',
    })
  })

  it('director-income-nicola sets Nicola as income earner', () => {
    expect(payloadFor('director-income-nicola')).toEqual({
      category: 'Director Income',
      owner: 'Nicola',
      is_income: true,
      is_transfer: false,
      is_provisional: false,
      matched_rule: 'year-end:director-income:nicola',
    })
  })

  it('wage-steven sets Salary category for Steven', () => {
    expect(payloadFor('wage-steven')).toEqual({
      category: 'Salary',
      owner: 'Steven',
      is_income: true,
      is_transfer: false,
      is_provisional: false,
      matched_rule: 'year-end:wage:steven',
    })
  })

  it("directors-loan flags row as transfer with null category", () => {
    expect(payloadFor('directors-loan')).toEqual({
      category: null,
      owner: 'Joint',
      is_income: null,
      is_transfer: true,
      is_provisional: false,
      matched_rule: 'year-end:directors-loan',
    })
  })

  it('reimbursement flags row as transfer with null category', () => {
    expect(payloadFor('reimbursement')).toEqual({
      category: null,
      owner: 'Joint',
      is_income: null,
      is_transfer: true,
      is_provisional: false,
      matched_rule: 'year-end:reimbursement',
    })
  })
})

describe('REVERT_PAYLOAD', () => {
  it('restores Director Drawings provisional shape', () => {
    expect(REVERT_PAYLOAD).toEqual({
      category: 'Director Drawings',
      owner: 'Joint',
      is_income: null,
      is_transfer: false,
      is_provisional: true,
      matched_rule: 'merchant:bht_directors_loan_to_joint',
    })
  })
})

describe('classificationFromMatchedRule', () => {
  it('returns null for null rule', () => {
    expect(classificationFromMatchedRule(null)).toBeNull()
  })

  it('returns null for the foundation merchant rule (not yet classified)', () => {
    expect(classificationFromMatchedRule('merchant:bht_directors_loan_to_joint')).toBeNull()
  })

  it('returns null for unrelated rules', () => {
    expect(classificationFromMatchedRule('merchant:netflix')).toBeNull()
  })

  it('maps year-end:director-income:steven', () => {
    expect(classificationFromMatchedRule('year-end:director-income:steven')).toBe('director-income-steven')
  })

  it('maps year-end:director-income:nicola', () => {
    expect(classificationFromMatchedRule('year-end:director-income:nicola')).toBe('director-income-nicola')
  })

  it('maps year-end:wage:steven', () => {
    expect(classificationFromMatchedRule('year-end:wage:steven')).toBe('wage-steven')
  })

  it('maps year-end:directors-loan', () => {
    expect(classificationFromMatchedRule('year-end:directors-loan')).toBe('directors-loan')
  })

  it('maps year-end:reimbursement', () => {
    expect(classificationFromMatchedRule('year-end:reimbursement')).toBe('reimbursement')
  })
})

describe('isYearEndClassification', () => {
  it('accepts every known classification', () => {
    for (const c of YEAR_END_CLASSIFICATIONS) {
      expect(isYearEndClassification(c)).toBe(true)
    }
  })

  it('rejects unknown strings', () => {
    expect(isYearEndClassification('revert')).toBe(false)
    expect(isYearEndClassification('foo')).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(isYearEndClassification(null)).toBe(false)
    expect(isYearEndClassification(undefined)).toBe(false)
    expect(isYearEndClassification(42)).toBe(false)
  })
})

describe('CLASSIFICATION_LABELS', () => {
  it('has a label for every classification', () => {
    for (const c of YEAR_END_CLASSIFICATIONS) {
      expect(CLASSIFICATION_LABELS[c]).toBeTruthy()
    }
  })
})
