import { describe, test, expect } from 'vitest'
import { groundTruthFixtures } from './groundTruth.fixtures'
import { guessCategory } from '../autoCategory'
import { cleanMerchant } from '../cleanMerchant'

describe('Ground truth categorisation accuracy', () => {
  const results = groundTruthFixtures.map(fixture => ({
    merchant: fixture.merchant,
    detected: guessCategory(cleanMerchant(fixture.merchant)),
    expected: fixture.correctCategory,
    correct: guessCategory(cleanMerchant(fixture.merchant)) === fixture.correctCategory,
  }))

  test('category accuracy should be above 80%', () => {
    if (results.length === 0) {
      // No fixtures yet — export from /dev/training once labels are confirmed
      expect(true).toBe(true)
      return
    }
    const correct = results.filter(r => r.correct).length
    const accuracy = correct / results.length
    expect(accuracy).toBeGreaterThanOrEqual(0.80)
  })

  // Individual per-merchant tests — skipped by default (informational only)
  for (const fixture of groundTruthFixtures) {
    if (fixture.correctCategory) {
      test.skip(`${fixture.merchant} → ${fixture.correctCategory}`, () => {
        const detected = guessCategory(cleanMerchant(fixture.merchant))
        expect(detected).toBe(fixture.correctCategory)
      })
    }
  }
})
