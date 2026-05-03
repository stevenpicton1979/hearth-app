import { describe, it, expect } from 'vitest'
import { applyMerchantCategoryRules } from '../merchantCategoryRules'
import fixture from './fixtures/coverageMerchants.json'

interface FixtureMerchant {
  merchant: string
  isIncome: boolean
  count: number
  totalAmount: number
}

/**
 * Merchants we explicitly choose NOT to write rules for.
 * These are typically one-off payees, anonymous PTY LTDs without context, or
 * merchants Steven prefers to classify manually via /mappings.
 *
 * Adding a merchant here is an explicit decision to leave it unmatched.
 * Removing one (because you added a rule) should turn the test greener.
 */
const EXPECTED_UNMATCHED = new Set<string>([
  // Truly ambiguous local PTY LTDs — no public context to identify them
  'TFAP PTY LTD',
  'TEJGON PTY LTD',
  'H C KALYAN PTY LTD',
  'TEAM COOPS PTY LTD',
  'LASHAND INVESTMENTS PL',
  'BRINCO2005 PTY LTD',
])

const merchants = (fixture.merchants ?? []) as FixtureMerchant[]

describe('coverage regression — production merchant fixture', () => {
  it('fixture is non-empty (otherwise the test is meaningless)', () => {
    expect(merchants.length).toBeGreaterThan(0)
  })

  it('every fixture merchant either matches a rule or is in EXPECTED_UNMATCHED', () => {
    const unexpectedlyUnmatched: string[] = []
    for (const { merchant, isIncome } of merchants) {
      const result = applyMerchantCategoryRules(merchant, { isIncome })
      if (!result && !EXPECTED_UNMATCHED.has(merchant)) {
        unexpectedlyUnmatched.push(merchant)
      }
    }
    expect(unexpectedlyUnmatched, `Unexpected unmatched merchants:\n  ${unexpectedlyUnmatched.join('\n  ')}`).toEqual([])
  })

  it('every member of EXPECTED_UNMATCHED is actually unmatched (catches stale exemptions)', () => {
    // If you add a rule for a merchant in EXPECTED_UNMATCHED but forget to remove
    // it from the set, this test surfaces that — the merchant now matches but
    // we're still pretending it's unmatched, which makes the suite lie.
    const stale: string[] = []
    for (const exempt of EXPECTED_UNMATCHED) {
      const inFixture = merchants.find(m => m.merchant === exempt)
      if (!inFixture) continue  // exempt isn't in current fixture; not a stale check
      const result = applyMerchantCategoryRules(exempt, { isIncome: inFixture.isIncome })
      if (result) {
        stale.push(`${exempt} → matched ${result.ruleName}`)
      }
    }
    expect(stale, `Stale EXPECTED_UNMATCHED entries:\n  ${stale.join('\n  ')}`).toEqual([])
  })

  it('reports current coverage stats (informational, always passes)', () => {
    let matched = 0
    let unmatchedExempt = 0
    let unmatchedUnexempt = 0
    let totalCount = 0
    let matchedCount = 0
    for (const m of merchants) {
      totalCount += m.count
      const result = applyMerchantCategoryRules(m.merchant, { isIncome: m.isIncome })
      if (result) {
        matched++
        matchedCount += m.count
      } else if (EXPECTED_UNMATCHED.has(m.merchant)) {
        unmatchedExempt++
      } else {
        unmatchedUnexempt++
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[coverage] ${matched}/${merchants.length} merchants matched, ` +
      `${unmatchedExempt} exempt, ${unmatchedUnexempt} unexpectedly unmatched. ` +
      `${matchedCount}/${totalCount} transactions covered (${((matchedCount/totalCount)*100).toFixed(1)}%).`
    )
    expect(true).toBe(true)
  })
})
