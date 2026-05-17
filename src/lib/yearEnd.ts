/**
 * Year-end Director Drawings classification helpers.
 *
 * Australian FY runs July 1 → June 30. FY2026 = 2025-07-01 to 2026-06-30.
 */

export type YearEndClassification =
  | 'director-income-steven'
  | 'director-income-nicola'
  | 'wage-steven'
  | 'directors-loan'
  | 'reimbursement'

export const YEAR_END_CLASSIFICATIONS: readonly YearEndClassification[] = [
  'director-income-steven',
  'director-income-nicola',
  'wage-steven',
  'directors-loan',
  'reimbursement',
] as const

export const CLASSIFICATION_LABELS: Record<YearEndClassification, string> = {
  'director-income-steven': 'Director Income (Steven)',
  'director-income-nicola': 'Director Income (Nicola)',
  'wage-steven': 'Wage (Steven)',
  'directors-loan': "Director's Loan",
  'reimbursement': 'Reimbursement',
}

/**
 * Field updates produced by each classification. Spreadable directly into a Supabase update.
 */
export interface ClassificationPayload {
  category: string | null
  owner: string | null
  is_income: boolean | null
  is_transfer: boolean
  is_provisional: boolean
  matched_rule: string
}

export function payloadFor(c: YearEndClassification): ClassificationPayload {
  switch (c) {
    case 'director-income-steven':
      return { category: 'Director Income', owner: 'Steven', is_income: true, is_transfer: false, is_provisional: false, matched_rule: 'year-end:director-income:steven' }
    case 'director-income-nicola':
      return { category: 'Director Income', owner: 'Nicola', is_income: true, is_transfer: false, is_provisional: false, matched_rule: 'year-end:director-income:nicola' }
    case 'wage-steven':
      return { category: 'Salary', owner: 'Steven', is_income: true, is_transfer: false, is_provisional: false, matched_rule: 'year-end:wage:steven' }
    case 'directors-loan':
      return { category: null, owner: 'Joint', is_income: null, is_transfer: true, is_provisional: false, matched_rule: 'year-end:directors-loan' }
    case 'reimbursement':
      return { category: null, owner: 'Joint', is_income: null, is_transfer: true, is_provisional: false, matched_rule: 'year-end:reimbursement' }
  }
}

export const REVERT_PAYLOAD: ClassificationPayload = {
  category: 'Director Drawings',
  owner: 'Joint',
  is_income: null,
  is_transfer: false,
  is_provisional: true,
  matched_rule: 'merchant:bht_directors_loan_to_joint',
}

/**
 * Returns the FY number containing the given ISO date.
 * 2026-05-17 → 2026 (FY2026 = 2025-07-01 to 2026-06-30)
 * 2026-07-01 → 2027 (first day of FY2027)
 */
export function fyForDate(isoDate: string): number {
  const [y, m] = isoDate.split('-').map(Number)
  return m >= 7 ? y + 1 : y
}

/**
 * Returns the inclusive date range for an Australian FY.
 * fy(2026) → { startDate: '2025-07-01', endDate: '2026-06-30' }
 */
export function fyDateRange(fy: number): { startDate: string; endDate: string } {
  return {
    startDate: `${fy - 1}-07-01`,
    endDate: `${fy}-06-30`,
  }
}

export function fyLabel(fy: number): string {
  return `FY${fy} (Jul ${fy - 1} – Jun ${fy})`
}

/**
 * Detect the classification from a stored matched_rule. Returns null for unclassified
 * or non-year-end rows. Used by the UI to render the revert affordance.
 */
export function classificationFromMatchedRule(rule: string | null): YearEndClassification | null {
  if (!rule) return null
  if (rule === 'year-end:director-income:steven') return 'director-income-steven'
  if (rule === 'year-end:director-income:nicola') return 'director-income-nicola'
  if (rule === 'year-end:wage:steven') return 'wage-steven'
  if (rule === 'year-end:directors-loan') return 'directors-loan'
  if (rule === 'year-end:reimbursement') return 'reimbursement'
  return null
}

export function isYearEndClassification(value: unknown): value is YearEndClassification {
  return typeof value === 'string' && (YEAR_END_CLASSIFICATIONS as readonly string[]).includes(value)
}

export interface YearEndRow {
  amount: number
  is_provisional: boolean
  classification: YearEndClassification | null
}

export interface YearEndSummary {
  provisionalTotal: number
  confirmedTotal: number
  totalDrawn: number
  provisionalCount: number
  byClassification: Record<YearEndClassification, { count: number; total: number }>
}

export function summarizeRows(rows: readonly YearEndRow[]): YearEndSummary {
  const byClassification: YearEndSummary['byClassification'] = {
    'director-income-steven': { count: 0, total: 0 },
    'director-income-nicola': { count: 0, total: 0 },
    'wage-steven': { count: 0, total: 0 },
    'directors-loan': { count: 0, total: 0 },
    'reimbursement': { count: 0, total: 0 },
  }

  let provisionalTotal = 0
  let confirmedTotal = 0
  let provisionalCount = 0

  for (const r of rows) {
    if (r.is_provisional) {
      provisionalTotal += r.amount
      provisionalCount += 1
    } else if (r.classification) {
      confirmedTotal += r.amount
      byClassification[r.classification].count += 1
      byClassification[r.classification].total += r.amount
    }
  }

  return {
    provisionalTotal,
    confirmedTotal,
    totalDrawn: provisionalTotal + confirmedTotal,
    provisionalCount,
    byClassification,
  }
}
