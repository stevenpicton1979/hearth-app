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

/** Three-state match classification for a merchant group. */
export type MatchStatus = 'rule' | 'gl' | 'unmatched'

export interface CoverageRow {
  merchant: string
  count: number
  totalValue: number
  matchedRule: string | null
  /** 'rule' = named rule fired; 'gl' = no rule but has GL account context; 'unmatched' = genuine gap */
  matchStatus: MatchStatus
  autoCategory: string | null
  autoOwner: string | null
  exampleRawDescription: string | null
}

interface GroupAcc {
  merchant: string
  count: number
  totalValue: number
  matchedRule: string | null
  hasGlAccount: boolean
  autoCategory: string | null
  autoOwner: string | null
  exampleRawDescription: string | null
}

/**
 * Groups raw transaction rows by merchant and produces a sorted coverage table.
 *
 * matchStatus per merchant:
 *   'rule'      = has a matched_rule
 *   'gl'        = no rule, but at least one transaction has a gl_account
 *   'unmatched' = no rule and no gl_account on any transaction — genuine coverage gap
 *
 * filterStatus, when provided, keeps only merchants with that matchStatus.
 * Sorted by count descending.
 */
export function buildCoverageRows(rows: TxForCoverage[], filterStatus?: MatchStatus | null): CoverageRow[] {
  const groups = new Map<string, GroupAcc>()

  for (const tx of rows) {
    const existing = groups.get(tx.merchant)
    if (existing) {
      existing.count++
      existing.totalValue += tx.amount
      if (tx.gl_account != null) existing.hasGlAccount = true
    } else {
      groups.set(tx.merchant, {
        merchant: tx.merchant,
        count: 1,
        totalValue: tx.amount,
        matchedRule: tx.matched_rule,
        hasGlAccount: tx.gl_account != null,
        autoCategory: tx.category,
        autoOwner: tx.classification,
        exampleRawDescription: tx.raw_description,
      })
    }
  }

  let result: CoverageRow[] = Array.from(groups.values()).map(acc => {
    const matchStatus: MatchStatus =
      acc.matchedRule !== null ? 'rule' :
      acc.hasGlAccount ? 'gl' :
      'unmatched'
    return {
      merchant: acc.merchant,
      count: acc.count,
      totalValue: acc.totalValue,
      matchedRule: acc.matchedRule,
      matchStatus,
      autoCategory: acc.autoCategory,
      autoOwner: acc.autoOwner,
      exampleRawDescription: acc.exampleRawDescription,
    }
  })

  if (filterStatus) {
    result = result.filter(r => r.matchStatus === filterStatus)
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
