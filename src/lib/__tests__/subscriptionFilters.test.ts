import { describe, it, expect } from 'vitest'
import { applySubscriptionFilters, SubscriptionFilterContext } from '@/lib/subscriptionFilters'
import { DetectedSubscription } from '@/lib/types'

function makeSub(overrides: Partial<DetectedSubscription> = {}): DetectedSubscription {
  return {
    subscription_id: null,
    display_name: 'ACME CORP',
    merchant: 'ACME CORP',
    merchants: ['ACME CORP'],
    account_id: 'acc-1',
    account_name: 'Savings',
    amount: 9.99,
    frequency: 'monthly',
    interval_days: 30,
    annual_estimate: 119.88,
    last_charged: '2026-04-01',
    next_expected: '2026-05-01',
    occurrences: 5,
    confidence: 'HIGH',
    is_lapsed: false,
    ...overrides,
  }
}

const emptyCtx: SubscriptionFilterContext = {
  dismissedMerchants: new Set(),
  activeMerchantToSubId: new Map(),
  subscriptionNames: new Map(),
}

describe('applySubscriptionFilters', () => {
  it('returns input unchanged for empty filter context', () => {
    const subs = [
      makeSub(),
      makeSub({ merchant: 'SPOTIFY', merchants: ['SPOTIFY'], display_name: 'SPOTIFY' }),
    ]
    const result = applySubscriptionFilters(subs, emptyCtx)
    expect(result).toHaveLength(2)
    expect(result[0]).toBe(subs[0])
    expect(result[1]).toBe(subs[1])
  })

  it('filters out entry whose primary merchant is in dismissedMerchants', () => {
    const dismissed = makeSub({ merchant: 'OCT-DEC 2025', merchants: ['OCT-DEC 2025'], display_name: 'OCT-DEC 2025' })
    const kept = makeSub({ merchant: 'NETFLIX', merchants: ['NETFLIX'], display_name: 'NETFLIX' })
    const ctx: SubscriptionFilterContext = {
      ...emptyCtx,
      dismissedMerchants: new Set(['OCT-DEC 2025']),
    }
    const result = applySubscriptionFilters([dismissed, kept], ctx)
    expect(result).toHaveLength(1)
    expect(result[0].merchant).toBe('NETFLIX')
  })

  it('filters out entry when any alias in merchants[] is in dismissedMerchants', () => {
    const sub = makeSub({
      subscription_id: 'sub-1',
      merchant: 'ALIAS_A',
      merchants: ['ALIAS_A', 'ALIAS_B'],
      display_name: 'My Sub',
    })
    const ctx: SubscriptionFilterContext = {
      ...emptyCtx,
      dismissedMerchants: new Set(['ALIAS_B']),
    }
    const result = applySubscriptionFilters([sub], ctx)
    expect(result).toHaveLength(0)
  })

  it('uses subscription name as display_name for linked entries', () => {
    const sub = makeSub({
      subscription_id: 'sub-hcf',
      merchant: 'HCFHEALTH',
      merchants: ['HCFHEALTH', 'THE HOSPITALS CONTRI'],
      display_name: 'HCFHEALTH',
    })
    const ctx: SubscriptionFilterContext = {
      ...emptyCtx,
      subscriptionNames: new Map([['sub-hcf', 'HCF Health Insurance']]),
    }
    const result = applySubscriptionFilters([sub], ctx)
    expect(result).toHaveLength(1)
    expect(result[0].display_name).toBe('HCF Health Insurance')
  })

  it('multi-alias linked subscription passes through as a single entry with all aliases intact', () => {
    const sub = makeSub({
      subscription_id: 'sub-hcf',
      merchant: 'HCFHEALTH',
      merchants: ['HCFHEALTH', 'THE HOSPITALS CONTRI'],
      display_name: 'HCF Health Insurance',
    })
    const ctx: SubscriptionFilterContext = {
      ...emptyCtx,
      subscriptionNames: new Map([['sub-hcf', 'HCF Health Insurance']]),
    }
    const result = applySubscriptionFilters([sub], ctx)
    expect(result).toHaveLength(1)
    expect(result[0].merchants).toEqual(['HCFHEALTH', 'THE HOSPITALS CONTRI'])
    expect(result[0].merchant).toBe('HCFHEALTH')
  })

  it('surfaces candidate whose merchant is not in activeMerchantToSubId (cancelled sub still charging)', () => {
    // Cancelled sub: its merchant is NOT in activeMerchantToSubId because
    // only is_active=true subs are included. The merchant appears as a
    // candidate (subscription_id: null) and must not be silently dropped.
    const candidate = makeSub({
      subscription_id: null,
      merchant: 'HUBBL - BINGE',
      merchants: ['HUBBL - BINGE'],
      display_name: 'HUBBL - BINGE',
    })
    const ctx: SubscriptionFilterContext = {
      dismissedMerchants: new Set(),
      activeMerchantToSubId: new Map(), // cancelled sub excluded
      subscriptionNames: new Map(),
    }
    const result = applySubscriptionFilters([candidate], ctx)
    expect(result).toHaveLength(1)
    expect(result[0].merchant).toBe('HUBBL - BINGE')
    expect(result[0].subscription_id).toBeNull()
  })
})
