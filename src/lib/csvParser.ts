import { ParsedTransaction } from './types'
import { cleanMerchant } from './cleanMerchant'
import { guessCategory } from './autoCategory'
import { isTransfer } from './transferPatterns'

function parseDate(raw: string): string | null {
  // Handle DD/MM/YYYY
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  // Handle YYYY-MM-DD
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (ymd) return raw
  return null
}

// Parse NAB date format: "22 Jan 26" → "2026-01-22"
function parseNABDate(raw: string): string | null {
  const m = raw.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2})$/)
  if (!m) return null
  const day = m[1].padStart(2, '0')
  const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
  const monthIdx = monthNames.indexOf(m[2].toLowerCase())
  if (monthIdx === -1) return null
  const month = String(monthIdx + 1).padStart(2, '0')
  const yr = parseInt(m[3], 10)
  const year = yr < 50 ? 2000 + yr : 1900 + yr
  return `${year}-${month}-${day}`
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

type CSVFormat = 'cba_4col' | 'cba_4col_noheader' | 'cba_5col' | 'anz' | 'westpac' | 'nab_cc' | 'amex' | 'generic'

const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/

// NAB category → Hearth category mapping
const NAB_CATEGORY_MAP: Record<string, string> = {
  'Fuel': 'Transport',
  'Restaurants & takeaway': 'Eating Out',
  'Home improvements': 'Household',
  'Accommodation': 'Travel',
  'Travel expenses': 'Transport',
  'Vehicle expenses': 'Transport',
  'Electronics & technology': 'Shopping',
  'Other shopping': 'Shopping',
  'Groceries': 'Food & Groceries',
  'Health & medical': 'Medical',
  'Entertainment': 'Entertainment',
  'Utilities': 'Utilities',
}

function detectFormat(headers: string[]): CSVFormat {
  const h = headers.map(hdr => hdr.toLowerCase().trim())

  // CBA exports have NO header row — first line is a date. Detect by checking if
  // the first cell looks like DD/MM/YYYY.
  if (headers.length >= 3 && DATE_RE.test(headers[0].trim())) {
    return 'cba_4col_noheader'
  }

  // NAB credit card: header contains "transaction type" and "merchant name"
  if (h.includes('transaction type') && h.includes('merchant name')) {
    return 'nab_cc'
  }

  // Amex: header has "date processed" in col 1 and "flexible" in col 4
  if (h[1] === 'date processed' && h[4] === 'flexible') {
    return 'amex'
  }

  if (h.includes('debit') && h.includes('credit') && h.includes('balance')) {
    if (h.length >= 5) return 'westpac'
    return 'cba_5col'
  }
  if (h.length === 4 && h[0].includes('date') && h[1].includes('amount')) return 'cba_4col'
  if (h.includes('details') || h.includes('particulars')) return 'anz'
  return 'generic'
}

export function parseCSV(text: string): ParsedTransaction[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 1) return []

  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
  const format = detectFormat(headers)
  const results: ParsedTransaction[] = []

  // For no-header CBA exports, data starts at line 0; otherwise line 1
  const dataStart = format === 'cba_4col_noheader' ? 0 : 1

  // Extract balance from first data row (most recent transaction in date-desc exports)
  let mostRecentBalance: number | undefined
  if (lines.length > dataStart) {
    const firstCols = lines[dataStart].split(',').map(c => c.replace(/^"|"$/g, '').trim())
    try {
      if (format === 'cba_4col' || format === 'cba_4col_noheader') mostRecentBalance = parseAmount(firstCols[3]) ?? undefined
      else if (format === 'cba_5col') mostRecentBalance = parseAmount(firstCols[4]) ?? undefined
      else if (format === 'westpac') mostRecentBalance = parseAmount(firstCols[7]) ?? undefined
    } catch { /* ignore */ }
  }

  let balanceAttached = false

  for (let i = dataStart; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim())
    if (cols.length < 2) continue

    let date: string | null = null
    let amount: number | null = null
    let description = ''
    let isTransferRow = false
    let nabCategoryOverride: string | null = null

    try {
      if (format === 'cba_4col' || format === 'cba_4col_noheader') {
        // Date, Amount, Description, Balance
        date = parseDate(cols[0])
        amount = parseAmount(cols[1])
        description = cols[2] || ''
      } else if (format === 'cba_5col') {
        // Date, Description, Debit, Credit, Balance
        date = parseDate(cols[0])
        description = cols[1] || ''
        const debit = parseAmount(cols[2])
        const credit = parseAmount(cols[3])
        if (debit && debit > 0) amount = -debit
        else if (credit && credit > 0) amount = credit
      } else if (format === 'westpac') {
        // BSB, AccNum, Date, Narration, ChequeNum, Debit, Credit, Balance
        date = parseDate(cols[2])
        description = cols[3] || ''
        const debit = parseAmount(cols[5])
        const credit = parseAmount(cols[6])
        if (debit && debit > 0) amount = -debit
        else if (credit && credit > 0) amount = credit
      } else if (format === 'anz') {
        // Date, Amount, Details/Description, ...
        date = parseDate(cols[0])
        amount = parseAmount(cols[1])
        description = cols[2] || ''
      } else if (format === 'nab_cc') {
        // Date, Amount, Account Number, [empty], Transaction Type, Transaction Details,
        // Balance, Category, Merchant Name, Processed On
        date = parseNABDate(cols[0])
        amount = parseAmount(cols[1])
        const txnType = cols[4] || ''
        const txnDetails = cols[5] || ''
        const nabCategory = cols[7] || ''
        const merchantName = cols[8] || ''
        description = merchantName || txnDetails
        isTransferRow =
          txnType === 'CREDIT CARD PAYMENT' ||
          nabCategory === 'Internal transfers' ||
          txnDetails.includes('CASH/TRANSFER PAYMENT') ||
          txnDetails.includes('INTERNET PAYMENT Linked Acc Trns')
        nabCategoryOverride = NAB_CATEGORY_MAP[nabCategory] ?? null
      } else if (format === 'amex') {
        // Date, Date Processed, Description, Amount, Flexible
        // Positive amount = purchase (spending) — negate to match Hearth convention
        date = parseDate(cols[0])
        const raw = parseAmount(cols[3])
        amount = raw !== null ? -raw : null
        description = cols[2].trim()
        isTransferRow = /PAYMENT|THANK YOU|DIRECT DEBIT|AUTOPAY/i.test(description)
      } else {
        // generic: try date in col 0, amount somewhere, description
        date = parseDate(cols[0])
        // find the amount column (first numeric column after date)
        for (let c = 1; c < cols.length - 1; c++) {
          const a = parseAmount(cols[c])
          if (a !== null && !isNaN(a)) {
            amount = a
            description = cols.slice(c + 1).find(x => x.length > 2) || cols[1]
            break
          }
        }
        if (!description) description = cols[1]
      }
    } catch {
      continue
    }

    if (!date || amount === null || !description) continue
    if (amount === 0) continue

    // For CBA/ANZ/Westpac/generic: use pattern-based transfer detection and skip
    // NAB and Amex use their own transfer detection (is_transfer flag set above)
    if (format !== 'nab_cc' && format !== 'amex' && isTransfer(description)) continue

    const merchant = cleanMerchant(description)
    const isIncome = amount > 0

    let category: string | null
    if (isTransferRow || isIncome) {
      category = null
    } else if (nabCategoryOverride !== null) {
      category = nabCategoryOverride
    } else {
      category = guessCategory(merchant)
    }

    // Attach balance to first parsed transaction only (most recent row)
    const balance = !balanceAttached ? mostRecentBalance : undefined
    balanceAttached = true

    results.push({ date, amount, description, merchant, category, is_transfer: isTransferRow, balance })
  }

  return results
}

/**
 * Extract the NAB account name from a raw NAB credit card CSV.
 * Returns e.g. "NAB Credit Card (·1687)" from "Card ending 1687", or null.
 */
export function extractNABAccountName(text: string): string | null {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return null
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
  if (detectFormat(headers) !== 'nab_cc') return null
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim())
    const accountNum = cols[2] || ''
    const m = accountNum.match(/Card ending (\d+)/i)
    if (m) return `NAB Credit Card (\u00b7${m[1]})`
  }
  return null
}

/**
 * Detect an Amex CSV and return the fixed account name "Business Amex", or null.
 */
export function extractAmexAccountName(text: string): string | null {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 1) return null
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
  return detectFormat(headers) === 'amex' ? 'Business Amex' : null
}

/**
 * Extract the most recent account balance directly from a raw CSV string,
 * without filtering for transfers or expense-only rows. This gives a reliable
 * balance for account net-worth tracking regardless of what rows are skipped.
 */
export function extractBalance(text: string): number | undefined {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 1) return undefined

  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
  const format = detectFormat(headers)

  // For no-header CBA exports, first data row is line 0; otherwise line 1
  const dataStart = format === 'cba_4col_noheader' ? 0 : 1
  if (lines.length <= dataStart) return undefined

  const firstCols = lines[dataStart].split(',').map(c => c.replace(/^"|"$/g, '').trim())
  try {
    if (format === 'cba_4col' || format === 'cba_4col_noheader') {
      const bal = parseAmount(firstCols[3])
      return bal !== null ? bal : undefined
    }
    if (format === 'cba_5col') {
      const bal = parseAmount(firstCols[4])
      return bal !== null ? bal : undefined
    }
    if (format === 'westpac') {
      const bal = parseAmount(firstCols[7])
      return bal !== null ? bal : undefined
    }
  } catch { /* ignore */ }
  return undefined
}
