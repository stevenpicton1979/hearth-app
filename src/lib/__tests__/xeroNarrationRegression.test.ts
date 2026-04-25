import { describe, it, expect } from 'vitest'
import {
  applyXeroTransferRules,
  extractDestinationSuffix,
  type XeroTransferContext,
} from '../xeroTransferRules'

// ---------------------------------------------------------------------------
// Regression fixtures — real Xero narration patterns seen in production.
//
// Each fixture encodes what we KNOW a given narration should produce.
// If a rule-engine change breaks any of these, a test fails immediately.
// ---------------------------------------------------------------------------

interface Fixture {
  narration: string
  reference?: string
  destinationAccount: XeroTransferContext['destinationAccount']
  suffixPresentButUnmatched?: boolean
  expected: {
    ruleName: string
    is_transfer: boolean
    category?: string | null
    needs_review?: boolean
  }
}

const fixtures: Fixture[] = [
  // ── Rule 2 — Personal wages (Steven / Nicola / Joint) ─────────────────────
  {
    narration: 'WAGE TRANSFER TO XX5426',
    destinationAccount: { scope: 'household', owner: 'Steven' },
    expected: { ruleName: 'personal-wage', is_transfer: false, category: 'Salary' },
  },
  {
    narration: 'FIN WAGE TRANSFER TO XX1234',
    destinationAccount: { scope: 'household', owner: 'Nicola' },
    expected: { ruleName: 'personal-wage', is_transfer: false, category: 'Salary' },
  },
  {
    narration: 'wage transfer to ZZ0001',
    destinationAccount: { scope: 'household', owner: 'Joint' },
    expected: { ruleName: 'personal-wage', is_transfer: false, category: 'Salary' },
  },
  {
    // wage keyword in reference field, not narration
    narration: 'Transfer to XX5426',
    reference: 'Monthly Wage Payment',
    destinationAccount: { scope: 'household', owner: 'Steven' },
    expected: { ruleName: 'personal-wage', is_transfer: false, category: 'Salary' },
  },

  // ── Rule 3 — Sons' wages (external, no Hearth account) ────────────────────
  {
    narration: 'wage transfer to 0091',
    destinationAccount: null,
    suffixPresentButUnmatched: true,
    expected: { ruleName: 'sons-wages', is_transfer: false, category: 'Payroll Expense' },
  },
  {
    narration: 'PAYG WAGE PAYMENT',
    destinationAccount: null,
    suffixPresentButUnmatched: false,
    expected: { ruleName: 'sons-wages', is_transfer: false, category: 'Payroll Expense' },
  },
  {
    // wage with an unmatched suffix — sons-wages fires before unmatched-transfer
    narration: 'wage transfer to 9999',
    destinationAccount: null,
    suffixPresentButUnmatched: true,
    expected: { ruleName: 'sons-wages', is_transfer: false, category: 'Payroll Expense' },
  },

  // ── Rule 1 — Business card payoff ─────────────────────────────────────────
  {
    narration: 'Bank Transfer to Mastercard Bus. Plat',
    destinationAccount: { scope: 'business', owner: 'Business' },
    expected: { ruleName: 'business-card-payoff', is_transfer: true, category: null },
  },
  {
    // Rule 1 beats Rule 2 even if wage appears in the narration
    narration: 'wage Transfer to business account',
    destinationAccount: { scope: 'business', owner: 'Business' },
    expected: { ruleName: 'business-card-payoff', is_transfer: true },
  },

  // ── Rule 4 — Director drawings ────────────────────────────────────────────
  {
    narration: 'TRANSFER TO XX5426',
    destinationAccount: { scope: 'household', owner: 'Steven' },
    expected: { ruleName: 'director-drawings', is_transfer: false, category: 'Director Income' },
  },
  {
    narration: 'Director Drawings',
    destinationAccount: { scope: 'household', owner: 'Nicola' },
    expected: { ruleName: 'director-drawings', is_transfer: false, category: 'Director Income' },
  },
  {
    // Investment-scoped account owned by Steven — no personal-owner match, falls to default
    narration: 'Transfer to investment account',
    destinationAccount: { scope: 'investment', owner: 'Steven' },
    expected: { ruleName: 'director-drawings', is_transfer: false, category: 'Director Income' },
  },

  // ── Rule 5 — Unmatched transfer ───────────────────────────────────────────
  {
    narration: 'TRANSFER TO 9999',
    destinationAccount: null,
    suffixPresentButUnmatched: true,
    expected: { ruleName: 'unmatched-transfer', is_transfer: true, needs_review: true },
  },

  // ── Rule 6 — Default (regular business expenses) ──────────────────────────
  {
    narration: 'OFFICE SUPPLIES BRISBANE',
    destinationAccount: null,
    suffixPresentButUnmatched: false,
    expected: { ruleName: 'default', is_transfer: false, category: 'Business' },
  },
  {
    narration: 'GOOGLE ADS PAYMENT',
    destinationAccount: null,
    suffixPresentButUnmatched: false,
    expected: { ruleName: 'default', is_transfer: false, category: 'Business' },
  },
  {
    narration: 'SUPERANNUATION PAYMENT',
    destinationAccount: null,
    suffixPresentButUnmatched: false,
    expected: { ruleName: 'default', is_transfer: false, category: 'Business' },
  },
  {
    narration: 'CONTRACTOR INVOICE',
    destinationAccount: null,
    suffixPresentButUnmatched: false,
    expected: { ruleName: 'default', is_transfer: false, category: 'Business' },
  },
]

describe('Xero narration regression fixtures', () => {
  for (const fix of fixtures) {
    const label = fix.reference
      ? `"${fix.narration}" + ref="${fix.reference}"`
      : `"${fix.narration}"`

    it(`${label} → rule=${fix.expected.ruleName}`, () => {
      const ctx: XeroTransferContext = {
        narration: fix.narration,
        reference: fix.reference ?? '',
        destinationAccount: fix.destinationAccount,
        suffixPresentButUnmatched: fix.suffixPresentButUnmatched ?? false,
      }
      const result = applyXeroTransferRules(ctx)

      expect(result.ruleName).toBe(fix.expected.ruleName)
      expect(result.is_transfer).toBe(fix.expected.is_transfer)

      if ('category' in fix.expected) {
        expect(result.category).toBe(fix.expected.category)
      }
      if ('needs_review' in fix.expected) {
        expect(result.needs_review).toBe(fix.expected.needs_review)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// extractDestinationSuffix — real Xero narration patterns
// ---------------------------------------------------------------------------

describe('extractDestinationSuffix — real Xero patterns', () => {
  const cases: [string, string | null][] = [
    // Standard patterns
    ['WAGE TRANSFER TO XX5426',           'XX5426'],
    ['Transfer to 9876',                  '9876'],
    ['TRANSFER TO 1234',                  '1234'],
    ['wage transfer to ZZ0001',           'ZZ0001'],
    ['FIN WAGE TRANSFER TO AB1234',       'AB1234'],

    // No match cases
    ['Director Drawings',                 null],
    ['GOOGLE ADS PAYMENT',                null],
    ['wage payment external',             null],   // no "to SUFFIX" pattern
    ['Transfer to AB',                    null],   // only 2 chars — below 4-char min
    ['Bank Transfer to Mastercard Bus.',  null],   // "Mastercard" is 10 chars — above 8-char max
  ]

  for (const [input, expected] of cases) {
    it(`"${input}" → ${expected === null ? 'null' : `"${expected}"`}`, () => {
      expect(extractDestinationSuffix(input)).toBe(expected)
    })
  }
})
