/**
 * Maps Xero account type/code/name to a Hearth category.
 * Priority: account code (AU standard chart) > type > name keywords
 */
export function mapXeroAccountToCategory(type: string, code: string, name: string): string {
  const codeMap: Record<string, string> = {
    // Income
    '200': 'Business', '201': 'Business', '202': 'Business',
    // Cost of Sales
    '300': 'Business', '301': 'Business', '302': 'Business', '303': 'Business',
    // Expenses
    '400': 'Business',
    '404': 'Shopping',        // Advertising
    '408': 'Business',        // Bank Fees
    '412': 'Business',        // Cleaning
    '416': 'Business',        // Consulting & Accounting
    '420': 'Eating Out',      // Entertainment
    '424': 'Business',        // Freight & Courier
    '425': 'Business',        // Freight & Courier
    '429': 'Business',        // General Expenses
    '433': 'Insurance',       // Insurance
    '437': 'Business',        // Interest Expense
    '441': 'Business',        // Legal & Professional
    '445': 'Business',        // Light, Power, Heating
    '449': 'Business',        // Motor Vehicle Expenses (generic)
    '453': 'Business',        // Office Supplies
    '457': 'Business',        // Printing & Stationery
    '461': 'Business',        // Printing & Stationery
    '463': 'Business',        // Repairs & Maintenance
    '469': 'Household',       // Rent
    '473': 'Business',        // Repairs & Maintenance
    '477': 'Director Income', // Wages & Salaries
    '478': 'Director Income', // Wages & Salaries
    '479': 'Director Income', // Employer Superannuation
    '480': 'Business',        // Superannuation
    '485': 'Travel',          // Travel - National
    '486': 'Travel',          // Travel - International
    '489': 'Technology',      // Subscriptions
    '490': 'Technology',      // Subscriptions
    '493': 'Transport',       // Motor Vehicle / Uber
    '494': 'Transport',       // Motor Vehicle
    '495': 'Business',        // Parking
  }

  if (code && codeMap[code]) return codeMap[code]

  // Fall back to type-based mapping
  if (type === 'REVENUE' || type === 'SALES') return 'Business'
  if (type === 'EQUITY') return 'Director Income'

  // Fall back to name keyword matching
  const n = name.toLowerCase()
  if (n.includes('wage') || n.includes('salary') || n.includes('payroll')) return 'Director Income'
  if (n.includes('travel') || n.includes('transport') || n.includes('vehicle')) return 'Transport'
  if (n.includes('entertainment') || n.includes('meal')) return 'Eating Out'
  if (n.includes('subscription') || n.includes('software') || n.includes('phone') || n.includes('internet')) return 'Technology'
  if (n.includes('insurance')) return 'Insurance'
  if (n.includes('advertising') || n.includes('marketing')) return 'Shopping'

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
