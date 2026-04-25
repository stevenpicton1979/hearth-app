// Detect director/business income credits on CBA accounts.
// Must be called BEFORE the isTransfer check in categoryPipeline.
//
// Returns { match: true, category, ruleName } when the row is income from the business.
// Category is 'Salary' when "wage" appears anywhere in the description
// (case-insensitive), 'Director Income' otherwise (drawings, unresolved until
// accountant allocates at year-end as dividends / director loan).

export type DirectorIncomeCategory = 'Salary' | 'Director Income'

export interface DirectorIncomeResult {
  match: boolean
  category: DirectorIncomeCategory
  /**
   * Stable identifier for the pattern that matched, e.g. "director-income:netbank-wage".
   * Null when match is false.  Used to populate transactions.matched_rule.
   */
  ruleName: string | null
}

const WAGE_PATTERN = /\bwage\b/i

/** Each entry pairs a detection regex with a stable rule ID suffix. */
const DIRECTOR_INCOME_PATTERNS: { re: RegExp; name: string }[] = [
  { re: /netbank\s+wage/i,  name: 'netbank-wage' },
  { re: /\bfin\s+wage\b/i, name: 'fin-wage' },
  { re: /commbank\s+app/i,  name: 'commbank-app' },
  { re: /\bpayroll\b/i,   name: 'payroll' },
]

const EXCLUDE_PATTERNS = [
  /dir\s*loan\s*repay/i,
]

export function classifyDirectorIncome(description: string, amount: number): DirectorIncomeResult {
  if (amount <= 0) return { match: false, category: 'Director Income', ruleName: null }
  if (EXCLUDE_PATTERNS.some(re => re.test(description))) {
    return { match: false, category: 'Director Income', ruleName: null }
  }

  for (const { re, name } of DIRECTOR_INCOME_PATTERNS) {
    if (re.test(description)) {
      const category: DirectorIncomeCategory = WAGE_PATTERN.test(description) ? 'Salary' : 'Director Income'
      return { match: true, category, ruleName: 'director-income:' + name }
    }
  }

  return { match: false, category: 'Director Income', ruleName: null }
}

// Legacy boolean helper - kept for any callers that only need a yes/no answer
export function isDirectorIncome(description: string, amount: number): boolean {
  return classifyDirectorIncome(description, amount).match
}
