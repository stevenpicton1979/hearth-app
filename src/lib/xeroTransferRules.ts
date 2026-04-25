// Xero SPEND-TRANSFER classification rule engine.
//
// All outgoing Xero bank transactions arrive typed as SPEND-TRANSFER, but that
// label means very different things depending on destination:
//
//   Rule 1 — Business credit card payoff
//     Destination suffix matches a business-scoped Hearth account.
//     → is_transfer=true  (correct internal business transfer, cancel in P&L)
//
//   Rule 2 — Steve/Nicola/Joint personal wage
//     "wage" anywhere in narration (case-insensitive) AND
//     destination suffix matches a Steven, Nicola, or Joint account.
//     → is_transfer=false, category=Salary
//
//   Rule 3 — Sons' wages (paid externally, not a Hearth account)
//     "wage" anywhere in narration AND no matching Hearth account found.
//     → is_transfer=false, category=Payroll Expense
//
//   Rule 4 — Director drawings
//     No "wage" AND destination matches a Steven/Nicola/Joint account.
//     → is_transfer=false, category=Director Income
//
//   Rule 5 — Unmatched transfer (suffix present but unknown)
//     Narration contains "Transfer to XXXX" pattern but XXXX not in Hearth.
//     → is_transfer=true, needs_review=true  (surfaced for user confirmation)
//
//   Rule 6 — Default
//     Everything else (supplier payments, etc.).
//     → is_transfer=false, category=Business

export interface XeroDestinationAccount {
  /** scope from the accounts table */
  scope: 'household' | 'business' | 'investment'
  /** owner from the accounts table */
  owner: 'Steven' | 'Nicola' | 'Joint' | 'Business' | null
}

export interface XeroTransferContext {
  /** Raw Xero narration field (before merchant cleaning) */
  narration: string
  /** Raw Xero reference field */
  reference: string
  /** Account resolved by matching the suffix extracted from narration/reference */
  destinationAccount: XeroDestinationAccount | null
  /** True when a suffix pattern was found in the text but no account matched it */
  suffixPresentButUnmatched: boolean
}

export interface XeroTransferOutcome {
  is_transfer: boolean
  category: string | null
  needs_review: boolean
  /** Human-readable name of the rule that fired, for logging/tests */
  ruleName: string
}

const WAGE_RE = /\bwage\b/i
const PERSONAL_OWNERS = new Set(['Steven', 'Nicola', 'Joint'])

export function applyXeroTransferRules(ctx: XeroTransferContext): XeroTransferOutcome {
  const text = `${ctx.narration} ${ctx.reference}`
  const hasWage = WAGE_RE.test(text)
  const dest = ctx.destinationAccount

  // Rule 1 — Business credit card payoff
  if (dest?.scope === 'business') {
    return { is_transfer: true, category: null, needs_review: false, ruleName: 'business-card-payoff' }
  }

  // Rule 2 — Personal wage (Steven / Nicola / Joint)
  if (hasWage && dest !== null && dest.owner !== null && PERSONAL_OWNERS.has(dest.owner)) {
    return { is_transfer: false, category: 'Salary', needs_review: false, ruleName: 'personal-wage' }
  }

  // Rule 3 — Sons' wages (wage keyword but no matching Hearth account)
  if (hasWage && dest === null) {
    return { is_transfer: false, category: 'Payroll Expense', needs_review: false, ruleName: 'sons-wages' }
  }

  // Rule 4 — Director drawings to personal account
  if (!hasWage && dest !== null && dest.owner !== null && PERSONAL_OWNERS.has(dest.owner)) {
    return { is_transfer: false, category: 'Director Income', needs_review: false, ruleName: 'director-drawings' }
  }

  // Rule 5 — Suffix found in narration but no matching account
  if (ctx.suffixPresentButUnmatched) {
    return { is_transfer: true, category: null, needs_review: true, ruleName: 'unmatched-transfer' }
  }

  // Rule 6 — Default: regular business expense
  return { is_transfer: false, category: 'Business', needs_review: false, ruleName: 'default' }
}

// ---------------------------------------------------------------------------
// Utility: extract the account suffix from a Xero narration/reference string.
// Matches patterns like "Transfer to XX5426", "WAGE TRANSFER TO 1234", etc.
// Returns the suffix string (uppercased) or null if no pattern found.
// ---------------------------------------------------------------------------
const SUFFIX_RE = /\bto\s+([A-Z0-9]{4,8})\b/i

export function extractDestinationSuffix(text: string): string | null {
  const m = SUFFIX_RE.exec(text)
  return m ? m[1].toUpperCase() : null
}
