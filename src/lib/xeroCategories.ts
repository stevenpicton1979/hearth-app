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
 * Parse Xero date — handles /Date(ms)/ and ISO 8601 formats.
 * Returns ISO date string (YYYY-MM-DD).
 */
export function parseXeroDate(xeroDate: string): string {
  if (!xeroDate) return new Date().toISOString().split('T')[0]

  // Format 1: /Date(1234567890000+0000)/ or /Date(1234567890000)/
  const msMatch = xeroDate.match(/\/Date\((\d+)/)
  if (msMatch) {
    return new Date(parseInt(msMatch[1], 10)).toISOString().split('T')[0]
  }

  // Format 2: ISO 8601 — "2024-03-15T00:00:00" or "2024-03-15"
  const iso = new Date(xeroDate)
  if (!isNaN(iso.getTime())) {
    return iso.toISOString().split('T')[0]
  }

  return new Date().toISOString().split('T')[0]
}

/**
 * Clean merchant name from Xero transaction fields, in priority order:
 * line item description > reference > contact name > narration > 'Xero'
 * Skips line item description if it looks like a bare number/amount.
 */
export function cleanXeroMerchant(
  reference: string | undefined,
  contactName: string | null,
  lineItemDescription: string | undefined,
  narration: string | undefined
): string {
  const isNumeric = (s: string) => /^\$?£?€?[\d,.\s]+$/.test(s)

  const lineDesc = lineItemDescription?.trim()
  if (lineDesc && !isNumeric(lineDesc)) return lineDesc.slice(0, 100)

  const ref = reference?.trim()
  if (ref) return ref.slice(0, 100)

  const contact = contactName?.trim()
  if (contact) return contact.slice(0, 100)

  const narr = narration?.trim()
  if (narr) return narr.slice(0, 100)

  return 'Xero'
}
