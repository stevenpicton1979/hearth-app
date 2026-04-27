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
 *
 * ─── Category conventions ─────────────────────────────────────────────────────
 *
 * Business       = BHT operating expenses (accounting, admin, misc).
 *                  owner is always 'Business' for named rules; null only for the
 *                  legacy xero_misc_code catch-all.
 *
 * Entertainment  = Entertainment and media on the BHT account. Legitimate
 *                  business expenses; owner is 'Business'.
 *
 * Technology     = Cloud and software subscriptions on the BHT account.
 *                  owner is 'Business'.
 *
 * Salary         = PAYG wages received into a personal account. Owner will always
 *                  be 'Steven' or 'Nicola' — never null. (No rules yet; noted
 *                  here for future rules.)
 *
 * Director Income = Director's fees or profit distributions, taxed differently
 *                   from salary. Owner will always be 'Steven' or 'Nicola' —
 *                   never null. (No rules yet; noted for future.)
 *
 * isIncome: null = inherit from transaction amount sign. Only use true/false when
 * the match condition already knows the direction (e.g. checks ctx.isIncome).
 * For transfer rules (isTransfer: true), isIncome is always null — the is_transfer
 * flag is the authoritative classification; direction is irrelevant.
 */

export interface RuleContext {
  /** Used by income/transfer rules to gate on transaction direction. */
  isIncome: boolean
  /** Xero chart-of-accounts GL account name — used by GL-based rules. */
  glAccount?: string | null
  /** Account owner from the accounts table — reserved for future owner-specific rules. */
  accountOwner?: string | null
}

export interface MerchantCategoryRule {
  /** Short identifier used in logs and test descriptions */
  name: string
  /** Human-readable explanation of the rule */
  description: string
  /** Return true if this rule applies to the given merchant + context */
  match: (merchant: string, ctx: RuleContext) => boolean
  /** Full classification fingerprint for this rule */
  output: {
    /** Category to assign. null = no category (always paired with isTransfer: true) */
    category: string | null
    /** null = inherit from amount sign; true/false = this rule asserts the direction */
    isIncome: boolean | null
    isTransfer: boolean
    isSubscription: boolean
    owner: 'Steven' | 'Nicola' | 'Joint' | 'Business' | null
  }
}

export interface RuleResult {
  ruleName: string
  category: string | null
  isIncome: boolean | null
  isTransfer: boolean
  isSubscription: boolean
  owner: 'Steven' | 'Nicola' | 'Joint' | 'Business' | null
}

export const MERCHANT_CATEGORY_RULES: MerchantCategoryRule[] = [
  // ─── Government & Tax ────────────────────────────────────────────────────────

  {
    name: 'ato_payments',
    description: 'ATO / Tax Office payments from any source → Government & Tax',
    match: (m) => /\bato\b|tax\s+office|taxation\s+office/i.test(m),
    output: { category: 'Government & Tax', isIncome: null, isTransfer: false, isSubscription: false, owner: null },
  },

  // ─── Travel ──────────────────────────────────────────────────────────────────

  {
    name: 'airbnb',
    description: 'Airbnb accommodation bookings → Travel',
    match: (m) => /^airbnb/i.test(m),
    output: { category: 'Travel', isIncome: null, isTransfer: false, isSubscription: false, owner: null },
  },

  // ─── Transport ───────────────────────────────────────────────────────────────

  {
    name: 'uber',
    description: 'Uber rides → Transport',
    match: (m) => /^uber\b/i.test(m),
    output: { category: 'Transport', isIncome: null, isTransfer: false, isSubscription: false, owner: null },
  },

  // ─── Business ────────────────────────────────────────────────────────────────

  {
    name: 'bell_partners',
    description: 'Bell Partners accounting firm → Business',
    match: (m) => /bell\s*partners/i.test(m),
    output: { category: 'Business', isIncome: null, isTransfer: false, isSubscription: false, owner: 'Business' },
  },

  {
    name: 'invoice_income',
    description: 'Generic "INVOICE" description on income transactions → Business',
    match: (m, ctx) => /^invoice$/i.test(m) && ctx.isIncome,
    output: { category: 'Business', isIncome: true, isTransfer: false, isSubscription: false, owner: 'Business' },
  },

  {
    name: 'oncore_income',
    description:
      'Oncore client payments into Brisbane Health Tech → Business income. ' +
      'Oncore is a contractor management company that processes Steve\'s invoices ' +
      'and remits client fees to BHT. Raw descriptions often include an invoice ' +
      'reference prefix, e.g. "E41900232233 Oncore Contracto". Matches on income only.',
    match: (m, ctx) => /oncore/i.test(m) && ctx.isIncome,
    output: { category: 'Business', isIncome: true, isTransfer: false, isSubscription: false, owner: 'Business' },
  },

  {
    name: 'crosslateral_income',
    description:
      'Crosslateral client payments into Brisbane Health Tech → Business income. ' +
      'Crosslateral is a direct BHT client; their invoice payments arrive as income. ' +
      'Matches on income only.',
    match: (m, ctx) => /crosslateral/i.test(m) && ctx.isIncome,
    output: { category: 'Business', isIncome: true, isTransfer: false, isSubscription: false, owner: 'Business' },
  },

  // ─── Payroll ─────────────────────────────────────────────────────────────────

  {
    name: 'superannuation_payable',
    description: 'Xero GL account "Superannuation Payable" — SGC super payments → Payroll Expense',
    match: (m, ctx) => /superannuation payable/i.test(ctx.glAccount ?? ''),
    output: { category: 'Payroll Expense', isIncome: null, isTransfer: false, isSubscription: false, owner: 'Business' },
  },

  {
    name: 'income_tax_provision',
    description: 'Xero GL account matching income tax provision — company tax payments → Government & Tax',
    match: (m, ctx) => /income tax/i.test(ctx.glAccount ?? ''),
    output: { category: 'Government & Tax', isIncome: null, isTransfer: false, isSubscription: false, owner: 'Business' },
  },

  // ─── Subscriptions & Digital Services (Business card) ───────────────────────

  {
    name: 'xero_misc_code',
    description:
      'Xero "MIS" reference code — Miscellaneous account. Catches pre-fix transactions ' +
      'synced before cleanXeroMerchant learned to skip short Xero codes in the reference field. ' +
      'New syncs produce real contact names which are caught by the specific rules below.',
    match: (m) => m === 'MIS',
    output: { category: 'Business', isIncome: null, isTransfer: false, isSubscription: false, owner: null },
  },

  {
    name: 'google_one',
    description: 'Google One cloud storage subscription on business card → Technology',
    match: (m) => /google\s+one/i.test(m),
    output: { category: 'Technology', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
  },

  {
    name: 'steam_games',
    description: 'Steamgames / Steam game purchases on business card → Entertainment',
    match: (m) => /steamgames/i.test(m),
    output: { category: 'Entertainment', isIncome: null, isTransfer: false, isSubscription: false, owner: 'Business' },
  },

  {
    name: 'xbox',
    description: 'Microsoft Xbox Game Pass subscription and purchases on business card → Entertainment',
    match: (m) => /xbox/i.test(m),
    output: { category: 'Entertainment', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
  },

  {
    name: 'spotify',
    description: 'Spotify music subscription on business card → Entertainment (matches anywhere in merchant name)',
    match: (m) => /spotify/i.test(m),
    output: { category: 'Entertainment', isIncome: null, isTransfer: false, isSubscription: true, owner: 'Business' },
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
    output: { category: null, isIncome: null, isTransfer: true, isSubscription: false, owner: null },
  },

  {
    name: 'director_loan_repayment',
    description:
      'Director name appearing as payer INTO the business account → Transfer (directors loan repayment). ' +
      'This is Steve or Nicola injecting personal funds back into Brisbane Health Tech, ' +
      'not real business revenue.',
    match: (m, ctx) => /steven\s*picton|nicola\s*picton/i.test(m) && ctx.isIncome,
    output: { category: null, isIncome: null, isTransfer: true, isSubscription: false, owner: null },
  },
]

// ─── Evaluator ───────────────────────────────────────────────────────────────

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
      return { ruleName: rule.name, ...rule.output }
    }
  }
  return null
}
