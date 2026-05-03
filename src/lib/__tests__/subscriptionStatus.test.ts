import { describe, it, expect } from 'vitest'
import { categoriseSubscriptionStatus } from '@/lib/subscriptionStatus'

describe('categoriseSubscriptionStatus', () => {
  it('returns candidate when merchant has no mapping entry', () => {
    const mappings = new Map<string, string | null>()
    expect(categoriseSubscriptionStatus('NETFLIX', mappings)).toBe('candidate')
  })

  it('returns candidate when mapping classification is null', () => {
    const mappings = new Map<string, string | null>([['NETFLIX', null]])
    expect(categoriseSubscriptionStatus('NETFLIX', mappings)).toBe('candidate')
  })

  it('returns confirmed when classification is Subscription', () => {
    const mappings = new Map<string, string | null>([['NETFLIX', 'Subscription']])
    expect(categoriseSubscriptionStatus('NETFLIX', mappings)).toBe('confirmed')
  })

  it('returns dismissed when classification is Not a subscription', () => {
    const mappings = new Map<string, string | null>([['MYER', 'Not a subscription']])
    expect(categoriseSubscriptionStatus('MYER', mappings)).toBe('dismissed')
  })

  it('returns candidate for any unrecognised classification value', () => {
    const mappings = new Map<string, string | null>([['WOOLWORTHS', 'Groceries']])
    expect(categoriseSubscriptionStatus('WOOLWORTHS', mappings)).toBe('candidate')
  })

  it('is case-sensitive on merchant key lookup', () => {
    const mappings = new Map<string, string | null>([['netflix', 'Subscription']])
    expect(categoriseSubscriptionStatus('NETFLIX', mappings)).toBe('candidate')
  })

  it('handles multiple merchants independently', () => {
    const mappings = new Map<string, string | null>([
      ['NETFLIX', 'Subscription'],
      ['MYER', 'Not a subscription'],
      ['AMAZON', null],
    ])
    expect(categoriseSubscriptionStatus('NETFLIX', mappings)).toBe('confirmed')
    expect(categoriseSubscriptionStatus('MYER', mappings)).toBe('dismissed')
    expect(categoriseSubscriptionStatus('AMAZON', mappings)).toBe('candidate')
    expect(categoriseSubscriptionStatus('SPOTIFY', mappings)).toBe('candidate')
  })
})
