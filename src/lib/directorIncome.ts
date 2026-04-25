// Detect director/business income credits on CBA accounts.
// Must be called BEFORE the isTransfer check in categoryPipeline.
//
// Returns { match: true, category } when the row is income from the business.
// Category is 'Salary' when "wage" appears anywhere in the description
// (case-insensitive), 'Director Income' otherwise (drawings, unresolved until
// accountant allocates at year-end as dividends / director loan).

export type DirectorIncomeCategory = 'Salary' | 'Director Income'

export interface DirectorIncomeResult {
  match: boolean
  category: DirectorIncomeCategory
}

const WAGE_PATTERN = /\bwage\b/i

const DIRECTOR_INCOME_PATTERNS = [
  /netbank\s+wage/i,
  /\bfin\s+wage\b/i,
  /commbank\s+app/i,
  /\bpayroll\b/i,
]

const EXCLUDE_PATTERNS = [
  /dir\s*loan\s*repay/i,
]

export function classifyDirectorIncome(description: string, amount: number): DirectorIncomeResult {
  if (amount <= 0) return { match: false, category: 'Director Income' }
  if (EXCLUDE_PATTERNS.some(re => re.test(description))) return { match: false, category: 'Director Income' }

  const matched = DIRECTOR_INCOME_PATTERNS.some(re => re.test(description))
  if (!matched) return { match: false, category: 'Director Income' }

  const category: DirectorIncomeCategory = WAGE_PATTERN.test(description) ? 'Salary' : 'Director Income'
  return { match: true, category }
}

// Legacy boolean helper - kept for any callers that only need a yes/no answer
export function isDirectorIncome(description: string, amount: number): boolean {
  return classifyDirectorIncome(description, amount).match
}
