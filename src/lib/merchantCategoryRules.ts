/**
 * Explicit, named merchant categorisation rules.
 *
 * These rules are the single source of truth for well-known merchant patterns.
 * Add rules here — not in autoCategory.ts keyword arrays — when you want a
 * decision that is:
 *   • named (you can see why a transaction was categorised a certain way)
 *   • testable (each rule has a dedicated test)
 *   • changeable (one place to update, change propagates everywhere)
 *
 * Rules are evaluated in order. First match wins.
 * Return null from applyMerchantCategoryRules if no rule matches — the caller
 * then falls through to keyword guessing or GL account hints.
 */

export interface RuleContext {
  /** Signed amount — positive = income, negative = expense */
  amount: number
  isIncome: boolean
  accountScope?: string | null   // 'business' | 'household' | null
  accountOwner?: string | null   // 'Steven' | 'Nicola' | 'Joint' | null
  /** Xero chart-of-accounts GL account name, e.g. "2025 Directors Loan" */
  glAccount?: string | null
}

export interface MerchantCategoryRule {
  /** Short identifier used in logs and test descriptions */
  name: string
  /** Human-readable explanation of the rule */
  description: string
  /** Return true if this rule applies to the given merchant + context */
  match: (merchant: string, ctx: RuleContext) => boolean
  /** Category to assign. null = no category (use when isTransfer = true) */
  category: string | null
  /** Override is_transfer. Defaults to false (don't touch transfer flag). */
  isTransfer?: boolean
}

export const MERCHANT_CATEGORY_RULES: MerchantCategoryRule[] = [
  // ─── Government & Tax ────────────────────────────────────────────────────────

  {
    name: 'ato_payments',
    description: 'ATO / Tax Office payments from any source → Government & Tax',
    match: (m) => /\bato\b|tax\s+office|taxation\s+office/i.test(m),
    category: 'Government & Tax',
  },

  // ─── Travel ──────────────────────────────────────────────────────────────────

  {
    name: 'airbnb',
    description: 'Airbnb accommodation bookings → Travel',
    match: (m) => /^airbnb/i.test(m),
    category: 'Travel',
  },

  // ─── Transport ───────────────────────────────────────────────────────────────

  {
    name: 'uber',
    description: 'Uber rides → Transport',
    match: (m) => /^uber\b/i.test(m),
    category: 'Transport',
  },

  // ─── Business ────────────────────────────────────────────────────────────────

  {
    name: 'bell_partners',
    description: 'Bell Partners accounting firm → Business',
    match: (m) => /bell\s*partners/i.test(m),
    category: 'Business',
  },

  {
    name: 'invoice_income',
    description: 'Generic "INVOICE" description on income transactions → Business',
    match: (m, ctx) => /^invoice$/i.test(m) && ctx.isIncome,
    category: 'Business',
  },

  {
    name: 'oncore_income',
    description:
      'Oncore client payments into Brisbane Health Tech → Business income. ' +
      'Oncore is a contractor management company that processes Steve\'s invoices ' +
      'and remits client fees to BHT. Raw descriptions often include an invoice ' +
      'reference prefix, e.g. "E41900232233 Oncore Contracto". Matches on income only.',
    match: (m, ctx) => /oncore/i.test(m) && ctx.isIncome,
    category: 'Business',
  },

  {
    name: 'crosslateral_income',
    description:
      'Crosslateral client payments into Brisbane Health Tech → Business income. ' +
      'Crosslateral is a direct BHT client; their invoice payments arrive as income. ' +
      'Matches on income only.',
    match: (m, ctx) => /crosslateral/i.test(m) && ctx.isIncome,
    category: 'Business',
  },

  // ─── Subscriptions & Digital Services (Business card) ───────────────────────

  {
    name: 'xero_misc_code',
    description:
      'Xero "MIS" reference code — Miscellaneous account. Catches pre-fix transactions ' +
      'synced before cleanXeroMerchant learned to skip short Xero codes in the reference field. ' +
      'New syncs produce real contact names which are caught by the specific rules below.',
    match: (m) => m === 'MIS',
    category: 'Business',
  },

  {
    name: 'google_one',
    description: 'Google One cloud storage subscription on business card → Business',
    match: (m) => /google\s+one/i.test(m),
    category: 'Business',
  },

  {
    name: 'steam_games',
    description: 'Steamgames / Steam game purchases on business card → Business',
    match: (m) => /steamgames/i.test(m),
    category: 'Business',
  },

  {
    name: 'xbox',
    description: 'Microsoft Xbox subscriptions and purchases on business card → Business',
    match: (m) => /xbox/i.test(m),
    category: 'Business',
  },

  {
    name: 'spotify',
    description: 'Spotify music subscription on business card → Business (matches anywhere in merchant name)',
    match: (m) => /spotify/i.test(m),
    category: 'Business',
  },

  // ─── Transfers ───────────────────────────────────────────────────────────────

  {
    name: 'bht_directors_loan_transfer',
    description:
      'Debits from Brisbane Health Tech booked to the Directors Loan GL account in Xero. ' +
      'These are inter-account movements (loan drawdowns, balance transfers to xx5426) — ' +
      'not business expenses and not wages. The GL account "2025 Directors Loan" is the ' +
      'definitive discriminator; description patterns alone are too broad.',
    match: (m, ctx) => /directors loan/i.test(ctx.glAccount ?? ''),
    category: null,
    isTransfer: true,
  },

  {
    name: 'director_loan_repayment',
    description:
      'Director name appearing as payer INTO the business account → Transfer (directors loan repayment). ' +
      'This is Steve or Nicola injecting personal funds back into Brisbane Health Tech, ' +
      'not real business revenue.',
    match: (m, ctx) => /steven\s*picton|nicola\s*picton/i.test(m) && ctx.isIncome,
    category: null,
    isTransfer: true,
  },
]

// ─── Evaluator ───────────────────────────────────────────────────────────────

export interface RuleResult {
  ruleName: string
  category: string | null
  isTransfer: boolean
}

/**
 * Apply the first matching merchant rule.
 * Returns null if no rule matches — caller should fall through to keyword guessing.
 */
export function applyMerchantCategoryRules(
  merchant: string,
  ctx: RuleContext
): RuleResult | null {
  for (const rule of MERCHANT_CATEGORY_RULES) {
    if (rule.match(merchant, ctx)) {
      return {
        ruleName: rule.name,
        category: rule.category,
        isTransfer: rule.isTransfer ?? false,
      }
    }
  }
  return null
}
