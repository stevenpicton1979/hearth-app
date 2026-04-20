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

type CSVFormat = 'cba_4col' | 'cba_5col' | 'anz' | 'westpac' | 'generic'

function detectFormat(headers: string[]): CSVFormat {
  const h = headers.map(hdr => hdr.toLowerCase().trim())
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
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
  const format = detectFormat(headers)
  const results: ParsedTransaction[] = []

  // Extract balance from first data row (most recent transaction in date-desc exports)
  let mostRecentBalance: number | undefined
  if (lines.length >= 2) {
    const firstCols = lines[1].split(',').map(c => c.replace(/^"|"$/g, '').trim())
    try {
      if (format === 'cba_4col') mostRecentBalance = parseAmount(firstCols[3]) ?? undefined
      else if (format === 'cba_5col') mostRecentBalance = parseAmount(firstCols[4]) ?? undefined
      else if (format === 'westpac') mostRecentBalance = parseAmount(firstCols[7]) ?? undefined
    } catch { /* ignore */ }
  }

  let balanceAttached = false

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim())
    if (cols.length < 2) continue

    let date: string | null = null
    let amount: number | null = null
    let description = ''

    try {
      if (format === 'cba_4col') {
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
