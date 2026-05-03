import { describe, it, expect } from 'vitest'
import { CATEGORIES } from '@/lib/categories'

// Guards that the canonical CATEGORIES list is the source of truth and that
// the stale constants.ts list (which had Medical, Clothing & Apparel, Family,
// Holiday, Other) is no longer in circulation.
describe('canonical CATEGORIES (categories.ts)', () => {
  it('contains canonical entries added in Task 17', () => {
    expect(CATEGORIES).toContain('Healthcare')
    expect(CATEGORIES).toContain('Bank Fees')
    expect(CATEGORIES).toContain('Business Revenue')
    expect(CATEGORIES).toContain('Accounting')
    expect(CATEGORIES).toContain('Office Expenses')
    expect(CATEGORIES).toContain('Health & Fitness')
    expect(CATEGORIES).toContain('Internet & Phone')
  })

  it('does not contain stale entries from the old constants.ts list', () => {
    expect(CATEGORIES).not.toContain('Medical')
    expect(CATEGORIES).not.toContain('Clothing & Apparel')
    expect(CATEGORIES).not.toContain('Family')
    expect(CATEGORIES).not.toContain('Holiday')
    expect(CATEGORIES).not.toContain('Other')
    expect(CATEGORIES).not.toContain('Mortgage')
  })
})
