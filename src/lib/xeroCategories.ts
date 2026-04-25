/**
 * Maps Xero account type/code/name to a Hearth category.
 * Priority: account code (AU standard chart) > type > name keywords
 */
export function mapXeroAccountToCategory(type: string, code: string, name: string): string {
  const codeMap: Record<string, string> = {
    // Income / Revenue
    '200': 'Business', '201': 'Business', '202': 'Business',
    // Cost of Sales
    '300': 'Business', '301': 'Business', '302': 'Business', '303': 'Business',
    // Expenses — standard AU chart of accounts
    '400': 'Business',         // Operating Expenses (generic)
    '404': 'Business',         // Advertising & Marketing
    '408': 'Business',         // Bank Fees & Charges
    '412': 'Business',         // Cleaning
    '416': 'Business',         // Consulting & Accounting
    '420': 'Eating Out',       // Entertainment & Meals
    '424': 'Business',         // Freight & Courier
    '425': 'Business',         // Freight & Courier
    '429': 'Business',         // General Expenses
    '433': 'Insurance',        // Insurance
    '437': 'Business',         // Interest Expense
    '441': 'Business',         // Legal & Professional Fees
    '445': 'Utilities',        // Light, Power, Heating
    '449': 'Transport',        // Motor Vehicle Expenses
    '453': 'Business',         // Office Supplies
    '457': 'Business',         // Printing & Stationery
    '461': 'Business',         // Printing & Stationery
    '463': 'Business',         // Repairs & Maintenance
    '469': 'Household',        // Rent
    '473': 'Business',         // Repairs & Maintenance
    '477': 'Payroll Expense',  // Wages & Salaries (employees)
    '478': 'Payroll Expense',  // Wages & Salaries (employees)
    '479': 'Business',         // Employer Superannuation contributions
    '480': 'Business',         // Superannuation
    '485': 'Travel',           // Travel - National
    '486': 'Travel',           // Travel - International
    '489': 'Technology',       // Subscriptions
    '490': 'Technology',       // Subscriptions
    '493': 'Transport',        // Motor Vehicle Expenses
    '494': 'Transport',        // Motor Vehicle Expenses
    '495': 'Transport',        // Parking & Tolls
  }

  if (code && codeMap[code]) return codeMap[code]

  // Type-based fallback
  if (type === 'REVENUE' || type === 'SALES') return 'Business'
  if (type === 'EQUITY') return 'Director Income'

  // Name keyword fallback — covers custom chart-of-accounts entries
  const n = name.toLowerCase()
  if (n.includes('wage') || n.includes('salary') || n.includes('payroll')) return 'Payroll Expense'
  if (n.includes('superannuation') || n.includes('super ') || n.match(/super/)) return 'Business'
  if (n.includes('entertainment') || n.includes('meal') || n.includes('dining') || n.includes('restaurant')) return 'Eating Out'
  if (n.includes('motor') || n.includes('vehicle') || n.includes('fuel') || n.includes('petrol') || n.includes('parking') || n.includes('toll')) return 'Transport'
  if (n.includes('travel') || n.includes('accommodation') || n.includes('hotel') || n.includes('flight')) return 'Travel'
  if (n.includes('subscription') || n.includes('software') || n.includes('technology') || n.includes('internet') || n.includes('mobile') || n.includes('phone')) return 'Technology'
  if (n.includes('insurance')) return 'Insurance'
  if (n.includes('electricity') || n.includes('power') || n.includes('gas') || n.includes('water') || n.includes('utilit')) return 'Utilities'
  if (n.includes('grocery') || n.includes('groceries') || n.includes('supermarket')) return 'Groceries'
  if (n.includes('health') || n.includes('medical') || n.includes('dental') || n.includes('pharmacy') || n.includes('optical')) return 'Health'
  if (n.includes('rent') || n.includes('lease')) return 'Household'
  if (n.includes('advertising') || n.includes('marketing')) return 'Business'

  return 'Business'
}

/**
 * Map a GL account display name directly to a Hearth category.
 * Used when we only have the stored gl_account name (e.g. in training-labels API).
 */
export function mapGlAccountNameToCategory(glAccountName: string): string {
  return mapXeroAccountToCategory('', '', glAccountName)
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

export interface XeroRawDescriptionParams {
  contactName?: string | null
  reference?: string | null
  narration?: string | null
  /** All line item descriptions — duplicates are collapsed. */
  lineItemDescs?: (string | null | undefined)[]
  bankAccountName?: string | null
  /** Tracking category strings, e.g. ["Project: Infrastructure", "Region: QLD"]. */
  tracking?: string[]
  url?: string | null
}

/**
 * Compose a raw_description string from all available Xero transaction fields.
 * All non-empty values are joined with " | " so a human can read the full context.
 * Duplicate line item descriptions are collapsed to one entry.
 * Returns null if no fields produce any content.
 */
export function composeXeroRawDescription(params: XeroRawDescriptionParams): string | null {
  const {
    contactName, reference, narration,
    lineItemDescs = [], bankAccountName,
    tracking = [], url,
  } = params

  const uniqueLineDescs = Array.from(
    new Set(lineItemDescs.filter((s): s is string => Boolean(s && s.trim())))
  )

  const parts = [
    contactName,
    reference,
    narration,
    ...uniqueLineDescs,
    bankAccountName,
    ...tracking,
    url,
  ].filter((s): s is string => Boolean(s && s.trim()))

  if (parts.length === 0) return null
  return parts.join(' | ').slice(0, 500)
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
  // Skip Xero chart-of-accounts codes (e.g. "CSH", "GST") — short all-caps codes
  // that carry no merchant meaning. Fall through to reference instead.
  const isXeroCode = (s: string) => s.length <= 4 && /^[A-Z0-9]+$/.test(s)

  const lineDesc = lineItemDescription?.trim()
  if (lineDesc && !isNumeric(lineDesc) && !isXeroCode(lineDesc)) return lineDesc.slice(0, 100)

  const ref = reference?.trim()
  if (ref) {
    // BPAY to ATO: long numeric CRN followed by bank BPAY marker
    if (/^\d{10,}\s+commbank\s+app\s+bpa/i.test(ref)) return 'ATO'
    return ref.slice(0, 100)
  }

  const contact = contactName?.trim()
  if (contact) return contact.slice(0, 100)

  const narr = narration?.trim()
  if (narr) {
    if (/^\d{10,}\s+commbank\s+app\s+bpa/i.test(narr)) return 'ATO'
    return narr.slice(0, 100)
  }

  return 'Xero'
}
