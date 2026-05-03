import { describe, it, expect } from 'vitest'
import { detectSubscriptions } from '../subscriptionDetector'
import { Transaction } from '../types'

describe('subscriptionDetector - Subscription Detection Algorithm', () => {
  const mockAccounts = [
    { id: 'acc-1', display_name: 'Checking Account' },
    { id: 'acc-2', display_name: 'Savings Account' }
  ]

  const createTransaction = (
    merchant: string,
    amount: number,
    dateStr: string,
    category: string | null = null,
    account_id: string = 'acc-1'
  ): Transaction => ({
    id: `tx-${Math.random()}`,
    household_id: 'hh-1',
    account_id,
    date: dateStr,
    amount,
    description: `${merchant} CHARGE`,
    merchant,
    category,
    classification: null,
    notes: null,
    is_transfer: false,
    created_at: new Date().toISOString()
  })

  describe('Category awareness - Shopping category exclusion', () => {
    it('should NOT detect MYER as subscription even with 3 occurrences', () => {
      const transactions: Transaction[] = [
        createTransaction('MYER', -413, '2026-04-14', 'Shopping'),
        createTransaction('MYER', -300, '2026-03-12', 'Shopping'),
        createTransaction('MYER', -280, '2026-02-10', 'Shopping')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const myerSub = result.find(s => s.merchant === 'MYER')
      expect(myerSub).toBeUndefined()
    })

    it('should NOT detect shopping merchants as subscriptions', () => {
      const transactions: Transaction[] = [
        createTransaction('AMAZON AU', -50, '2026-04-01', 'Shopping'),
        createTransaction('AMAZON AU', -45, '2026-03-01', 'Shopping'),
        createTransaction('AMAZON AU', -48, '2026-02-01', 'Shopping'),
        createTransaction('AMAZON AU', -52, '2026-01-01', 'Shopping')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const amazonSub = result.find(s => s.merchant === 'AMAZON AU')
      expect(amazonSub).toBeUndefined()
    })

    it('should NOT detect DAVID JONES as subscription', () => {
      const transactions: Transaction[] = [
        createTransaction('DAVID JONES', -100, '2026-04-01', 'Shopping'),
        createTransaction('DAVID JONES', -95, '2026-03-01', 'Shopping'),
        createTransaction('DAVID JONES', -105, '2026-02-01', 'Shopping')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const djSub = result.find(s => s.merchant === 'DAVID JONES')
      expect(djSub).toBeUndefined()
    })
  })

  describe('Category awareness - Eating Out now included (delivery services like HelloFresh)', () => {
    it('detects consistent monthly MCDONALDS pattern (Eating Out no longer excluded)', () => {
      const transactions: Transaction[] = [
        createTransaction('MCDONALDS', -10, '2026-04-01', 'Eating Out'),
        createTransaction('MCDONALDS', -9.99, '2026-03-01', 'Eating Out'),
        createTransaction('MCDONALDS', -10.50, '2026-02-01', 'Eating Out'),
        createTransaction('MCDONALDS', -10, '2026-01-01', 'Eating Out')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const mcdonaldsSub = result.find(s => s.merchant === 'MCDONALDS')
      expect(mcdonaldsSub).toBeDefined()
    })

    it('detects consistent restaurant subscription pattern', () => {
      const transactions: Transaction[] = [
        createTransaction('RESTAURANT ABC', -50, '2026-04-01', 'Eating Out'),
        createTransaction('RESTAURANT ABC', -48, '2026-03-01', 'Eating Out'),
        createTransaction('RESTAURANT ABC', -52, '2026-02-01', 'Eating Out')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const restaurantSub = result.find(s => s.merchant === 'RESTAURANT ABC')
      expect(restaurantSub).toBeDefined()
    })

    it('detects consistent cafe pattern', () => {
      const transactions: Transaction[] = [
        createTransaction('COFFEE CAFE', -5.50, '2026-04-10', 'Eating Out'),
        createTransaction('COFFEE CAFE', -5.20, '2026-03-10', 'Eating Out'),
        createTransaction('COFFEE CAFE', -5.80, '2026-02-10', 'Eating Out')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const cafeSub = result.find(s => s.merchant === 'COFFEE CAFE')
      expect(cafeSub).toBeDefined()
    })

    it('detects consistent pub/regular visit pattern', () => {
      const transactions: Transaction[] = [
        createTransaction('LOCAL PUB', -45, '2026-04-01', 'Eating Out'),
        createTransaction('LOCAL PUB', -40, '2026-03-01', 'Eating Out'),
        createTransaction('LOCAL PUB', -50, '2026-02-01', 'Eating Out')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const pubSub = result.find(s => s.merchant === 'LOCAL PUB')
      expect(pubSub).toBeDefined()
    })
  })

  describe('Minimum occurrence threshold', () => {
    it('detects subscription with 2 occurrences (PROBABLE confidence)', () => {
      const transactions: Transaction[] = [
        createTransaction('NETFLIX', -15.99, '2026-04-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2026-03-01', 'Entertainment')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const netflixSub = result.find(s => s.merchant === 'NETFLIX')
      expect(netflixSub).toBeDefined()
      expect(netflixSub?.confidence).toBe('PROBABLE')
    })

    it('should NOT detect subscription with only 1 occurrence', () => {
      const transactions: Transaction[] = [
        createTransaction('NETFLIX', -15.99, '2026-04-01', 'Entertainment')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const netflixSub = result.find(s => s.merchant === 'NETFLIX')
      expect(netflixSub).toBeUndefined()
    })

    it('should detect subscription with 3 occurrences', () => {
      const transactions: Transaction[] = [
        createTransaction('NETFLIX', -15.99, '2026-04-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2026-03-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2026-02-01', 'Entertainment')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const netflixSub = result.find(s => s.merchant === 'NETFLIX')
      expect(netflixSub).toBeDefined()
      expect(netflixSub?.occurrences).toBe(3)
    })

    it('should detect subscription with 4+ occurrences', () => {
      const transactions: Transaction[] = [
        createTransaction('SPOTIFY', -12.99, '2026-04-01', 'Entertainment'),
        createTransaction('SPOTIFY', -12.99, '2026-03-01', 'Entertainment'),
        createTransaction('SPOTIFY', -12.99, '2026-02-01', 'Entertainment'),
        createTransaction('SPOTIFY', -12.99, '2026-01-01', 'Entertainment')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const spotifySub = result.find(s => s.merchant === 'SPOTIFY')
      expect(spotifySub).toBeDefined()
      expect(spotifySub?.occurrences).toBe(4)
    })
  })

  describe('Known subscription merchants with 3+ occurrences', () => {
    it('should detect NETFLIX with 3+ consistent monthly charges', () => {
      const transactions: Transaction[] = [
        createTransaction('NETFLIX', -15.99, '2026-04-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2026-03-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2026-02-01', 'Entertainment')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const netflixSub = result.find(s => s.merchant === 'NETFLIX')
      expect(netflixSub).toBeDefined()
      expect(netflixSub?.frequency).toBe('monthly')
      expect(netflixSub?.confidence).toBe('MEDIUM')
    })

    it('should detect SPOTIFY with 3+ consistent monthly charges', () => {
      const transactions: Transaction[] = [
        createTransaction('SPOTIFY', -12.99, '2026-04-15', 'Entertainment'),
        createTransaction('SPOTIFY', -12.99, '2026-03-15', 'Entertainment'),
        createTransaction('SPOTIFY', -12.99, '2026-02-15', 'Entertainment')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const spotifySub = result.find(s => s.merchant === 'SPOTIFY')
      expect(spotifySub).toBeDefined()
      expect(spotifySub?.frequency).toBe('monthly')
    })

    it('should detect subscription with HIGH confidence for 5+ occurrences', () => {
      const transactions: Transaction[] = [
        createTransaction('NETFLIX', -15.99, '2026-04-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2026-03-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2026-02-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2026-01-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2025-12-01', 'Entertainment')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const netflixSub = result.find(s => s.merchant === 'NETFLIX')
      expect(netflixSub).toBeDefined()
      expect(netflixSub?.confidence).toBe('HIGH')
    })

    it('should detect subscription with MEDIUM confidence for 3-4 occurrences', () => {
      const transactions: Transaction[] = [
        createTransaction('NETFLIX', -15.99, '2026-04-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2026-03-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2026-02-01', 'Entertainment')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const netflixSub = result.find(s => s.merchant === 'NETFLIX')
      expect(netflixSub).toBeDefined()
      expect(netflixSub?.confidence).toBe('MEDIUM')
    })
  })

  describe('Frequency detection', () => {
    it('should detect weekly subscriptions (7-day intervals)', () => {
      const transactions: Transaction[] = [
        createTransaction('APP SUBSCRIPTION', -9.99, '2026-04-15', 'Entertainment'),
        createTransaction('APP SUBSCRIPTION', -9.99, '2026-04-08', 'Entertainment'),
        createTransaction('APP SUBSCRIPTION', -9.99, '2026-04-01', 'Entertainment')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const appSub = result.find(s => s.merchant === 'APP SUBSCRIPTION')
      expect(appSub).toBeDefined()
      expect(appSub?.frequency).toBe('weekly')
    })

    it('should detect fortnightly subscriptions (14-day intervals)', () => {
      const transactions: Transaction[] = [
        createTransaction('WEEKLY SERVICE', -20, '2026-04-21', 'Entertainment'),
        createTransaction('WEEKLY SERVICE', -20, '2026-04-07', 'Entertainment'),
        createTransaction('WEEKLY SERVICE', -20, '2026-03-24', 'Entertainment')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const weeklySub = result.find(s => s.merchant === 'WEEKLY SERVICE')
      expect(weeklySub).toBeDefined()
      expect(weeklySub?.frequency).toBe('fortnightly')
    })

    it('should detect monthly subscriptions (30-day intervals)', () => {
      const transactions: Transaction[] = [
        createTransaction('NETFLIX', -15.99, '2026-04-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2026-03-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2026-02-01', 'Entertainment')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const netflixSub = result.find(s => s.merchant === 'NETFLIX')
      expect(netflixSub).toBeDefined()
      expect(netflixSub?.frequency).toBe('monthly')
    })

    it('should detect quarterly subscriptions (91-day intervals)', () => {
      const transactions: Transaction[] = [
        createTransaction('INSURANCE', -250, '2026-04-01', 'Insurance'),
        createTransaction('INSURANCE', -250, '2026-01-01', 'Insurance'),
        createTransaction('INSURANCE', -250, '2025-10-01', 'Insurance')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const insuranceSub = result.find(s => s.merchant === 'INSURANCE')
      expect(insuranceSub).toBeDefined()
      expect(insuranceSub?.frequency).toBe('quarterly')
    })

    it('should detect annual subscriptions (365-day intervals)', () => {
      const transactions: Transaction[] = [
        createTransaction('ANNUAL SUBSCRIPTION', -199, '2026-04-01', 'Entertainment'),
        createTransaction('ANNUAL SUBSCRIPTION', -199, '2025-04-01', 'Entertainment'),
        createTransaction('ANNUAL SUBSCRIPTION', -199, '2024-04-01', 'Entertainment')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const annualSub = result.find(s => s.merchant === 'ANNUAL SUBSCRIPTION')
      expect(annualSub).toBeDefined()
      expect(annualSub?.frequency).toBe('annual')
    })
  })

  describe('Amount consistency checking', () => {
    it('should detect subscription with consistent amounts (low CV)', () => {
      const transactions: Transaction[] = [
        createTransaction('NETFLIX', -15.99, '2026-04-01', 'Entertainment'),
        createTransaction('NETFLIX', -16.00, '2026-03-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.98, '2026-02-01', 'Entertainment')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const netflixSub = result.find(s => s.merchant === 'NETFLIX')
      expect(netflixSub).toBeDefined()
    })

    it('should NOT detect subscription with inconsistent amounts (high CV)', () => {
      const transactions: Transaction[] = [
        createTransaction('VARIABLE SERVICE', -100, '2026-04-01', 'Entertainment'),
        createTransaction('VARIABLE SERVICE', -50, '2026-03-01', 'Entertainment'),
        createTransaction('VARIABLE SERVICE', -30, '2026-02-01', 'Entertainment')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const varSub = result.find(s => s.merchant === 'VARIABLE SERVICE')
      expect(varSub).toBeUndefined()
    })
  })

  describe('Transfers and income filtering', () => {
    it('should skip transfer transactions', () => {
      const transactions: Transaction[] = [
        { ...createTransaction('TRANSFER', -100, '2026-04-01'), is_transfer: true },
        { ...createTransaction('TRANSFER', -100, '2026-03-01'), is_transfer: true },
        { ...createTransaction('TRANSFER', -100, '2026-02-01'), is_transfer: true }
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const transferSub = result.find(s => s.merchant === 'TRANSFER')
      expect(transferSub).toBeUndefined()
    })

    it('should skip income/credit transactions (amount >= 0)', () => {
      const transactions: Transaction[] = [
        createTransaction('REFUND', 100, '2026-04-01'),
        createTransaction('REFUND', 100, '2026-03-01'),
        createTransaction('REFUND', 100, '2026-02-01')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const refundSub = result.find(s => s.merchant === 'REFUND')
      expect(refundSub).toBeUndefined()
    })
  })

  describe('Account handling', () => {
    it('should assign subscription to primary account for merchant', () => {
      const transactions: Transaction[] = [
        createTransaction('NETFLIX', -15.99, '2026-04-01', 'Entertainment', 'acc-1'),
        createTransaction('NETFLIX', -15.99, '2026-03-01', 'Entertainment', 'acc-1'),
        createTransaction('NETFLIX', -15.99, '2026-02-01', 'Entertainment', 'acc-2')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const netflixSub = result.find(s => s.merchant === 'NETFLIX')
      expect(netflixSub).toBeDefined()
      expect(netflixSub?.account_id).toBe('acc-1')
      expect(netflixSub?.account_name).toBe('Checking Account')
    })

    it('should use account display name from provided accounts', () => {
      const transactions: Transaction[] = [
        createTransaction('NETFLIX', -15.99, '2026-04-01', 'Entertainment', 'acc-1'),
        createTransaction('NETFLIX', -15.99, '2026-03-01', 'Entertainment', 'acc-1'),
        createTransaction('NETFLIX', -15.99, '2026-02-01', 'Entertainment', 'acc-1')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const netflixSub = result.find(s => s.merchant === 'NETFLIX')
      expect(netflixSub?.account_name).toBe('Checking Account')
    })
  })

  describe('Output fields', () => {
    it('should include all required output fields', () => {
      const transactions: Transaction[] = [
        createTransaction('NETFLIX', -15.99, '2026-04-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2026-03-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2026-02-01', 'Entertainment')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const netflixSub = result[0]
      expect(netflixSub).toHaveProperty('merchant')
      expect(netflixSub).toHaveProperty('account_id')
      expect(netflixSub).toHaveProperty('account_name')
      expect(netflixSub).toHaveProperty('amount')
      expect(netflixSub).toHaveProperty('frequency')
      expect(netflixSub).toHaveProperty('interval_days')
      expect(netflixSub).toHaveProperty('annual_estimate')
      expect(netflixSub).toHaveProperty('last_charged')
      expect(netflixSub).toHaveProperty('next_expected')
      expect(netflixSub).toHaveProperty('occurrences')
      expect(netflixSub).toHaveProperty('confidence')
      expect(netflixSub).toHaveProperty('is_lapsed')
    })

    it('should calculate correct annual estimate', () => {
      const transactions: Transaction[] = [
        createTransaction('NETFLIX', -15.99, '2026-04-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2026-03-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2026-02-01', 'Entertainment')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const netflixSub = result.find(s => s.merchant === 'NETFLIX')
      expect(netflixSub?.amount).toBeCloseTo(15.99, 1)
      expect(netflixSub?.annual_estimate).toBeGreaterThan(180)
      expect(netflixSub?.annual_estimate).toBeLessThan(200)
    })

    it('should set last_charged to most recent transaction date', () => {
      const transactions: Transaction[] = [
        createTransaction('NETFLIX', -15.99, '2026-04-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2026-03-01', 'Entertainment'),
        createTransaction('NETFLIX', -15.99, '2026-02-01', 'Entertainment')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const netflixSub = result.find(s => s.merchant === 'NETFLIX')
      expect(netflixSub?.last_charged).toBe('2026-04-01')
    })
  })

  describe('Business-account subscription detection', () => {
    const businessAccount = { id: 'acc-biz', display_name: 'BHT Business Account' }
    const allAccounts = [...mockAccounts, businessAccount]

    it('detects Spotify charged to a business account', () => {
      const transactions: Transaction[] = [
        createTransaction('SPOTIFY', -12.99, '2026-04-01', 'Entertainment', 'acc-biz'),
        createTransaction('SPOTIFY', -12.99, '2026-03-01', 'Entertainment', 'acc-biz'),
        createTransaction('SPOTIFY', -12.99, '2026-02-01', 'Entertainment', 'acc-biz'),
      ]
      const result = detectSubscriptions(transactions, allAccounts)
      const sub = result.find(s => s.merchant === 'SPOTIFY')
      expect(sub).toBeDefined()
      expect(sub?.account_id).toBe('acc-biz')
      expect(sub?.account_name).toBe('BHT Business Account')
      expect(sub?.frequency).toBe('monthly')
    })

    it('detects Xbox charged to a business account', () => {
      const transactions: Transaction[] = [
        createTransaction('XBOX GAME PASS', -14.95, '2026-04-05', 'Entertainment', 'acc-biz'),
        createTransaction('XBOX GAME PASS', -14.95, '2026-03-05', 'Entertainment', 'acc-biz'),
        createTransaction('XBOX GAME PASS', -14.95, '2026-02-05', 'Entertainment', 'acc-biz'),
      ]
      const result = detectSubscriptions(transactions, allAccounts)
      const sub = result.find(s => s.merchant === 'XBOX GAME PASS')
      expect(sub).toBeDefined()
      expect(sub?.account_id).toBe('acc-biz')
    })

    it('detects Google One charged to a business account', () => {
      const transactions: Transaction[] = [
        createTransaction('GOOGLE ONE', -3.49, '2026-04-10', 'Technology', 'acc-biz'),
        createTransaction('GOOGLE ONE', -3.49, '2026-03-10', 'Technology', 'acc-biz'),
        createTransaction('GOOGLE ONE', -3.49, '2026-02-10', 'Technology', 'acc-biz'),
      ]
      const result = detectSubscriptions(transactions, allAccounts)
      const sub = result.find(s => s.merchant === 'GOOGLE ONE')
      expect(sub).toBeDefined()
      expect(sub?.account_id).toBe('acc-biz')
    })

    it('detects subscriptions across both household and business accounts simultaneously', () => {
      const transactions: Transaction[] = [
        createTransaction('NETFLIX', -22.99, '2026-04-01', 'Entertainment', 'acc-1'),
        createTransaction('NETFLIX', -22.99, '2026-03-01', 'Entertainment', 'acc-1'),
        createTransaction('NETFLIX', -22.99, '2026-02-01', 'Entertainment', 'acc-1'),
        createTransaction('SPOTIFY', -12.99, '2026-04-01', 'Entertainment', 'acc-biz'),
        createTransaction('SPOTIFY', -12.99, '2026-03-01', 'Entertainment', 'acc-biz'),
        createTransaction('SPOTIFY', -12.99, '2026-02-01', 'Entertainment', 'acc-biz'),
      ]
      const result = detectSubscriptions(transactions, allAccounts)
      const netflix = result.find(s => s.merchant === 'NETFLIX')
      const spotify = result.find(s => s.merchant === 'SPOTIFY')
      expect(netflix).toBeDefined()
      expect(netflix?.account_id).toBe('acc-1')
      expect(spotify).toBeDefined()
      expect(spotify?.account_id).toBe('acc-biz')
    })
  })

  describe('The Myer bug - exact scenario', () => {
    it('should NOT flag two Myer purchases ($413 on 14 Apr, $300 on 12 Mar) as subscription', () => {
      const transactions: Transaction[] = [
        createTransaction('MYER', -413, '2026-04-14', 'Shopping'),
        createTransaction('MYER', -300, '2026-03-12', 'Shopping')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const myerSub = result.find(s => s.merchant === 'MYER')
      expect(myerSub).toBeUndefined()
    })

    it('should NOT flag Myer as subscription even with 3 occurrences in Shopping category', () => {
      const transactions: Transaction[] = [
        createTransaction('MYER', -413, '2026-04-14', 'Shopping'),
        createTransaction('MYER', -350, '2026-03-12', 'Shopping'),
        createTransaction('MYER', -280, '2026-02-10', 'Shopping')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      const myerSub = result.find(s => s.merchant === 'MYER')
      expect(myerSub).toBeUndefined()
    })

    it('should NOT flag Myer as subscription due to 2 occurrences and Shopping category', () => {
      const transactions: Transaction[] = [
        createTransaction('MYER', -413, '2026-04-14', 'Shopping'),
        createTransaction('MYER', -300, '2026-03-12', 'Shopping')
      ]
      const result = detectSubscriptions(transactions, mockAccounts)
      expect(result.find(s => s.merchant === 'MYER')).toBeUndefined()
    })
  })
})
