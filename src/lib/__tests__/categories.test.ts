import { describe, it, expect } from 'vitest'
import { getOutcomeBucket, formatBucketPath } from '../categories'

describe('getOutcomeBucket', () => {
  it('Business income', () => {
    expect(getOutcomeBucket({ owner: 'Business', isIncome: true, isSubscription: false, category: 'Business Revenue' }))
      .toEqual(['Business', 'Income', 'Business Revenue'])
  })

  it('Business expense — non-subscription', () => {
    expect(getOutcomeBucket({ owner: 'Business', isIncome: false, isSubscription: false, category: 'Accounting' }))
      .toEqual(['Business', 'Expenses', 'Accounting'])
  })

  it('Business expense — subscription', () => {
    expect(getOutcomeBucket({ owner: 'Business', isIncome: false, isSubscription: true, category: 'Technology' }))
      .toEqual(['Business', 'Expenses', 'Subscriptions'])
  })

  it('Joint income', () => {
    expect(getOutcomeBucket({ owner: 'Joint', isIncome: true, isSubscription: false, category: 'Salary' }))
      .toEqual(['Personal', 'Joint', 'Income', 'Salary'])
  })

  it('Joint expense', () => {
    expect(getOutcomeBucket({ owner: 'Joint', isIncome: false, isSubscription: false, category: 'Groceries' }))
      .toEqual(['Personal', 'Joint', 'Expenses', 'Groceries'])
  })

  it('Personal (Steven) expense — subscription', () => {
    expect(getOutcomeBucket({ owner: 'Steven', isIncome: false, isSubscription: true, category: 'Entertainment' }))
      .toEqual(['Personal', 'Steven', 'Expenses', 'Subscriptions', 'Entertainment'])
  })

  it('Personal (Steven) expense — non-subscription', () => {
    expect(getOutcomeBucket({ owner: 'Steven', isIncome: false, isSubscription: false, category: 'Groceries' }))
      .toEqual(['Personal', 'Steven', 'Expenses', 'Groceries'])
  })

  it('Personal (Steven) income', () => {
    expect(getOutcomeBucket({ owner: 'Steven', isIncome: true, isSubscription: false, category: 'Salary' }))
      .toEqual(['Personal', 'Steven', 'Income', 'Salary'])
  })

  it('null owner falls back to Unknown', () => {
    expect(getOutcomeBucket({ owner: null, isIncome: false, isSubscription: false, category: 'Shopping' }))
      .toEqual(['Personal', 'Unknown', 'Expenses', 'Shopping'])
  })

  it('null category falls back to Uncategorised', () => {
    expect(getOutcomeBucket({ owner: 'Steven', isIncome: false, isSubscription: false, category: null }))
      .toEqual(['Personal', 'Steven', 'Expenses', 'Uncategorised'])
  })

  it('null owner + null category', () => {
    expect(getOutcomeBucket({ owner: null, isIncome: false, isSubscription: false, category: null }))
      .toEqual(['Personal', 'Unknown', 'Expenses', 'Uncategorised'])
  })
})

describe('formatBucketPath', () => {
  it('joins bucket segments with →', () => {
    expect(formatBucketPath(['Business', 'Expenses', 'Accounting'])).toBe('Business → Expenses → Accounting')
  })
})
