// Detect director/business income credits that should NOT be treated as transfers.
// Must be called BEFORE the isTransfer check in categoryPipeline.
// Returns true when the row is director income (incoming credit from business patterns).

const DIRECTOR_INCOME_PATTERNS = [
  /netbank\s+wage/i,
  /\bfin\s+wage\b/i,
  /\btransfer\s+from\b/i,
  /commbank\s+app/i,
  /\bpayroll\b/i,
  /\bsalary\b/i,
]

const EXCLUDE_PATTERNS = [
  /dir\s*loan\s*repay/i,
]

export function isDirectorIncome(description: string, amount: number): boolean {
  if (amount <= 0) return false
  if (EXCLUDE_PATTERNS.some(re => re.test(description))) return false
  return DIRECTOR_INCOME_PATTERNS.some(re => re.test(description))
}
