/**
 * Pure functions for the transaction coverage inspector (/dev/coverage).
 * All logic is isolated here so it can be tested without hitting the DB.
 */

export interface TxForCoverage {
  merchant: string
  amount: number
  category: string | null
  matched_rule: string | null
  classification: string | null
  raw_description: string | null
  gl_account?: string | null
  date?: string
}

export interface CoverageRow {
  merchant: string
  count: number
  totalValue: number
  matchedRule: string | null
  autoCategory: string | null
  autoOwner: string | null
  exampleRawDescription: string | null
}

/**
 * Groups raw transaction rows by merchant and produces a sorted coverage table.
 * When unmatchedOnly is true, only merchants with no matched_rule are returned.
 * First raw_description seen for each merchant is used as the example.
 * Sorted by count descending.
 */
export function buildCoverageRows(rows: TxForCoverage[], unmatchedOnly = false): CoverageRow[] {
  const groups = new Map<string, CoverageRow>()

  for (const tx of rows) {
    const existing = groups.get(tx.merchant)
    if (existing) {
      existing.count++
      existing.totalValue += tx.amount
    } else {
      groups.set(tx.merchant, {
        merchant: tx.merchant,
        count: 1,
        totalValue: tx.amount,
        matchedRule: tx.matched_rule,
        autoCategory: tx.category,
        autoOwner: tx.classification,
        exampleRawDescription: tx.raw_description,
      })
    }
  }

  let result = Array.from(groups.values())
  if (unmatchedOnly) {
    result = result.filter(r => r.matchedRule === null)
  }
  return result.sort((a, b) => b.count - a.count)
}

export interface TxExpansionRow {
  date: string | null
  amount: number
  glAccount: string | null
  isIncome: boolean
  rawDescription: string | null
}

/**
 * Maps raw transaction rows to the expanded detail format shown when a coverage
 * row is clicked. Returns one row per transaction, preserving all rule-engine
 * context fields.
 */
export function expandMerchantRows(rows: TxForCoverage[]): TxExpansionRow[] {
  return rows.map(tx => ({
    date: tx.date ?? null,
    amount: tx.amount,
    glAccount: tx.gl_account ?? null,
    isIncome: tx.amount > 0,
    rawDescription: tx.raw_description,
  }))
}
