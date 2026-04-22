import { Category } from './constants'

/**
 * Maps Xero account types and names to Hearth categories.
 * Priority: account type > account name keywords
 */
export function mapXeroAccountToCategory(
  accountType: string,
  accountCode: string,
  accountName: string
): Category {
  const name = accountName.toLowerCase()
  const type = accountType.toUpperCase()

  // EQUITY accounts (drawings, personal) -> Director Income
  if (type === 'EQUITY' || name.includes('drawing') || name.includes('personal')) {
    return 'Director Income'
  }

  // REVENUE/INCOME type -> Business
  if (type === 'REVENUE' || type === 'INCOME') {
    return 'Business'
  }

  // EXPENSE type: map by keywords
  if (type === 'EXPENSE') {
    if (name.includes('advertising') || name.includes('marketing')) return 'Shopping'
    if (name.includes('travel') || name.includes('mileage') || name.includes('motor')) return 'Transport'
    if (name.includes('entertainment') || name.includes('meals') || name.includes('conference') || name.includes('meal') || name.includes('food and beverage')) return 'Eating Out'
    if (name.includes('phone') || name.includes('internet') || name.includes('software') || name.includes('subscription') || name.includes('saas')) return 'Technology'
    if (name.includes('office') || name.includes('stationery') || name.includes('supplies')) return 'Business'
    if (name.includes('insurance')) return 'Insurance'
    if (name.includes('wages') || name.includes('salary') || name.includes('director fees')) return 'Director Income'
    // Default expense
    return 'Business'
  }

  // Default fallback
  return 'Business'
}

/**
 * Classifies a Xero transaction based on its type.
 * SPEND -> 'expense', RECEIVE -> 'income'
 */
export function mapXeroTransactionClassification(type: string): string | null {
  if (type === 'SPEND') return 'expense'
  if (type === 'RECEIVE') return 'income'
  return null
}

/**
 * Determines if a transaction scope should be 'household' based on Xero account type/name.
 * Normally defaults to 'business'; certain equity/drawings accounts -> 'household'
 */
export function shouldScopeAsHousehold(accountType: string, accountName: string): boolean {
  const name = accountName.toLowerCase()
  const type = accountType.toUpperCase()
  if (type === 'EQUITY' || name.includes('drawing') || name.includes('personal')) {
    return true
  }
  return false
}

/**
 * Parse Xero's /Date(timestamp)/ format.
 * Returns ISO date string (YYYY-MM-DD).
 */
export function parseXeroDate(xeroDate: string): string {
  const match = xeroDate.match(/\/Date\((\d+)\)\//)
  if (!match) return new Date().toISOString().split('T')[0]
  const ms = parseInt(match[1], 10)
  const date = new Date(ms)
  return date.toISOString().split('T')[0]
}

/**
 * Clean merchant name from Xero reference.
 */
export function cleanXeroMerchant(reference: string, contactName: string | null): string {
  const name = contactName || reference || 'Xero'
  // Remove extra whitespace
  return name.trim()
}
