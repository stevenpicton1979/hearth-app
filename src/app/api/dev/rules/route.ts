import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { MERCHANT_CATEGORY_RULES } from '@/lib/merchantCategoryRules'
import { TRANSFER_PATTERNS } from '@/lib/transferPatterns'

// ---------------------------------------------------------------------------
// Static rule definitions — mirrors what the rule engines actually do.
// Used by /dev/rules to display all codified rules in one place.
// ---------------------------------------------------------------------------

const DIRECTOR_INCOME_RULES = [
  { id: 'director-income:netbank-wage',  pattern: 'netbank wage (case-insensitive)',  category: 'Salary',          description: 'NETBANK WAGE credits — salary paid from business bank feed' },
  { id: 'director-income:fin-wage',      pattern: '\\bfin wage\\b (case-insensitive)', category: 'Salary',          description: 'FIN WAGE credits — alternative wage narration' },
  { id: 'director-income:commbank-app',  pattern: 'commbank app (case-insensitive)',  category: 'Director Income', description: 'COMMBANK APP transfers — drawings or director advances' },
  { id: 'director-income:payroll',       pattern: '\\bpayroll\\b (case-insensitive)', category: 'Director Income', description: 'PAYROLL credits without explicit wage keyword — director pay run' },
]

const XERO_TRANSFER_RULES = [
  { id: 'xero:business-card-payoff',   isTransfer: true,  category: null,              needsReview: false, description: 'SPEND-TRANSFER to a business-scoped account — credit card payoff. Cancel in P&L.' },
  { id: 'xero:personal-wage',          isTransfer: false, category: 'Salary',          needsReview: false, description: 'SPEND-TRANSFER with "wage" keyword to Steven / Nicola / Joint account.' },
  { id: 'xero:sons-wages',             isTransfer: false, category: 'Payroll Expense', needsReview: false, description: 'SPEND-TRANSFER with "wage" keyword but no matching Hearth account — external payroll.' },
  { id: 'xero:director-drawings',      isTransfer: false, category: 'Director Income', needsReview: false, description: 'SPEND-TRANSFER without "wage" to personal account — director drawings.' },
  { id: 'xero:unmatched-transfer',     isTransfer: true,  category: null,              needsReview: true,  description: 'SPEND-TRANSFER with a recognisable suffix but no matching Hearth account — needs review.' },
]

export async function GET() {
  const supabase = createServerClient()

  // Aggregate matched_rule counts across all transactions for this household
  const { data: hitRows, error } = await supabase
    .from('transactions')
    .select('matched_rule')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .not('matched_rule', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const hitCounts: Record<string, number> = {}
  for (const row of (hitRows ?? [])) {
    if (row.matched_rule) {
      hitCounts[row.matched_rule] = (hitCounts[row.matched_rule] ?? 0) + 1
    }
  }

  // Count unmatched (matched_rule IS NULL and not is_transfer)
  const { count: unmatchedCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .is('matched_rule', null)
    .eq('is_transfer', false)
    .not('category', 'is', null)

  const totalWithRule = Object.values(hitCounts).reduce((s, n) => s + n, 0)

  return NextResponse.json({
    summary: {
      totalWithRule,
      unmatchedCategorised: unmatchedCount ?? 0,
    },
    hitCounts,
    rules: {
      directorIncome: DIRECTOR_INCOME_RULES.map(r => ({
        ...r,
        hits: hitCounts[r.id] ?? 0,
      })),
      xeroTransfer: XERO_TRANSFER_RULES.map(r => ({
        ...r,
        hits: hitCounts[r.id] ?? 0,
      })),
      merchantCategory: MERCHANT_CATEGORY_RULES.map(r => ({
        id: `merchant:${r.name}`,
        name: r.name,
        description: r.description,
        category: r.output.category,
        isTransfer: r.output.isTransfer,
        hits: hitCounts[`merchant:${r.name}`] ?? 0,
      })),
      transferPattern: {
        id: 'transfer-pattern',
        description: 'Local regex patterns that detect transfers by description (e.g. "Transfer to", "OSKO", "Pay Anyone").',
        patternCount: TRANSFER_PATTERNS.length,
        patterns: TRANSFER_PATTERNS.map(re => re.toString()),
        hits: hitCounts['transfer-pattern'] ?? 0,
      },
    },
  })
}
