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

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

type CSVFormat = 'cba_4col' | 'cba_4col_noheader' | 'cba_5col' | 'anz' | 'westpac' | 'generic'

const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/

function detectFormat(headers: string[]): CSVFormat {
  const h = headers.map(hdr => hdr.toLowerCase().trim())

  // CBA exports have NO header row — first line is a date. Detect by checking if
  // the first cell looks like DD/MM/YYYY.
  if (headers.length >= 3 && DATE_RE.test(headers[0].trim())) {
    return 'cba_4col_noheader'
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
    if (amount >= 0) continue // expenses only
    if (isTransfer(description)) continue

    const merchant = cleanMerchant(description)
    const category = guessCategory(merchant)

    // Attach balance to first parsed transaction only (most recent row)
    const balance = !balanceAttached ? mostRecentBalance : undefined
    balanceAttached = true

    results.push({ date, amount, description, merchant, category, is_transfer: false, balance })
  }

  return results
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
