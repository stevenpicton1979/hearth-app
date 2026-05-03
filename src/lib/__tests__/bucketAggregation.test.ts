import { describe, it, expect } from 'vitest'
import { aggregateBuckets, summariseByRealm, BucketTransaction } from '../bucketAggregation'

describe('aggregateBuckets', () => {
  it('groups transactions by bucket path and sums absolute amounts', () => {
    const txs: BucketTransaction[] = [
      { owner: 'Joint', is_income: false, is_subscription: false, category: 'Groceries', amount: -100 },
      { owner: 'Joint', is_income: false, is_subscription: false, category: 'Groceries', amount: -50 },
      { owner: 'Joint', is_income: false, is_subscription: false, category: 'Eating Out', amount: -30 },
    ]
    const result = aggregateBuckets(txs)
    expect(result).toHaveLength(2)
    expect(result[0].totalAmount).toBe(150)
    expect(result[0].count).toBe(2)
    expect(result[0].bucket[result[0].bucket.length - 1]).toBe('Groceries')
    expect(result[1].totalAmount).toBe(30)
  })

  it('sorts descending by total amount', () => {
    const txs: BucketTransaction[] = [
      { owner: 'Joint', is_income: false, is_subscription: false, category: 'Eating Out', amount: -50 },
      { owner: 'Joint', is_income: false, is_subscription: false, category: 'Groceries', amount: -200 },
    ]
    const result = aggregateBuckets(txs)
    expect(result[0].totalAmount).toBe(200)
    expect(result[1].totalAmount).toBe(50)
  })

  it('skips transfers', () => {
    const txs: BucketTransaction[] = [
      { owner: 'Joint', is_income: false, is_subscription: false, category: 'Groceries', amount: -100 },
      { owner: null, is_income: false, is_subscription: false, is_transfer: true, category: null, amount: -5000 },
    ]
    const result = aggregateBuckets(txs)
    expect(result).toHaveLength(1)
    expect(result[0].totalAmount).toBe(100)
  })

  it('separates income from expenses for the same owner', () => {
    const txs: BucketTransaction[] = [
      { owner: 'Nicola', is_income: true, is_subscription: false, category: 'Salary', amount: 4000 },
      { owner: 'Joint', is_income: false, is_subscription: false, category: 'Groceries', amount: -100 },
    ]
    const result = aggregateBuckets(txs)
    expect(result).toHaveLength(2)
    const incomeRow = result.find(r => r.bucket.includes('Income'))
    expect(incomeRow?.totalAmount).toBe(4000)
  })

  it('separates subscriptions from non-subscription expenses for personal owners', () => {
    // Note: Joint expenses are flat (no Subscriptions subBucket) per getOutcomeBucket;
    // Steven/Nicola use the Subscriptions distinction. Test the distinction with Steven.
    const txs: BucketTransaction[] = [
      { owner: 'Steven', is_income: false, is_subscription: true, category: 'Entertainment', amount: -15 },
      { owner: 'Steven', is_income: false, is_subscription: false, category: 'Entertainment', amount: -25 },
    ]
    const result = aggregateBuckets(txs)
    expect(result).toHaveLength(2)
    const subRow = result.find(r => r.bucket.includes('Subscriptions'))
    expect(subRow?.totalAmount).toBe(15)
  })

  it('Joint expenses are flat (no Subscriptions subBucket per current taxonomy)', () => {
    const txs: BucketTransaction[] = [
      { owner: 'Joint', is_income: false, is_subscription: true, category: 'Entertainment', amount: -15 },
      { owner: 'Joint', is_income: false, is_subscription: false, category: 'Entertainment', amount: -25 },
    ]
    const result = aggregateBuckets(txs)
    // Both flatten to Personal → Joint → Expenses → Entertainment
    expect(result).toHaveLength(1)
    expect(result[0].totalAmount).toBe(40)
  })
})

describe('summariseByRealm', () => {
  it('rolls bucket rows up to (realm, direction) totals', () => {
    const txs: BucketTransaction[] = [
      // Business income $1000
      { owner: 'Business', is_income: true, is_subscription: false, category: 'Business Revenue', amount: 1000 },
      // Business expenses $200 (subscription) + $100 (other)
      { owner: 'Business', is_income: false, is_subscription: true, category: 'Technology', amount: -200 },
      { owner: 'Business', is_income: false, is_subscription: false, category: 'Office Expenses', amount: -100 },
      // Joint expenses $50
      { owner: 'Joint', is_income: false, is_subscription: false, category: 'Groceries', amount: -50 },
    ]
    const buckets = aggregateBuckets(txs)
    const summary = summariseByRealm(buckets)

    const bizIncome = summary.find(s => s.realm === 'Business' && s.direction === 'Income')
    const bizExp = summary.find(s => s.realm === 'Business' && s.direction === 'Expenses')
    const persExp = summary.find(s => s.realm === 'Personal' && s.direction === 'Expenses')

    expect(bizIncome?.total).toBe(1000)
    expect(bizExp?.total).toBe(300)
    expect(persExp?.total).toBe(50)
  })

  it('orders Business before Personal, Income before Expenses within each realm', () => {
    const txs: BucketTransaction[] = [
      { owner: 'Joint', is_income: true, is_subscription: false, category: 'Salary', amount: 100 },
      { owner: 'Joint', is_income: false, is_subscription: false, category: 'Groceries', amount: -100 },
      { owner: 'Business', is_income: true, is_subscription: false, category: 'Business Revenue', amount: 100 },
      { owner: 'Business', is_income: false, is_subscription: false, category: 'Office Expenses', amount: -100 },
    ]
    const summary = summariseByRealm(aggregateBuckets(txs))
    expect(summary[0]).toMatchObject({ realm: 'Business', direction: 'Income' })
    expect(summary[1]).toMatchObject({ realm: 'Business', direction: 'Expenses' })
    expect(summary[2]).toMatchObject({ realm: 'Personal', direction: 'Income' })
    expect(summary[3]).toMatchObject({ realm: 'Personal', direction: 'Expenses' })
  })
})
