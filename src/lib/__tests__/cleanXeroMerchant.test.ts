import { describe, it, expect } from 'vitest'
import { cleanXeroMerchant } from '../xeroCategories'

// ---------------------------------------------------------------------------
// cleanXeroMerchant — regression tests
//
// Guard against Xero GL account codes (CSH, VRP, ROT, DISC etc.) being used
// as merchant names. These are chart-of-accounts labels, not merchant names.
// The function should always prefer the reference or contact over a short code.
// ---------------------------------------------------------------------------

describe('cleanXeroMerchant — Xero code rejection', () => {
  it('skips 3-char GL code CSH in favour of reference', () => {
    expect(cleanXeroMerchant(
      'MICROSOFT*XBOX MSBILL.INFO AUS', // reference
      null,
      'CSH',                            // line item desc — should be skipped
      undefined,
    )).toBe('MICROSOFT*XBOX MSBILL.INFO AUS')
  })

  it('skips 3-char GL code VRP in favour of reference', () => {
    expect(cleanXeroMerchant(
      'AMpol',
      null,
      'VRP',
      undefined,
    )).toBe('AMpol')
  })

  it('skips 3-char GL code ROT in favour of reference', () => {
    expect(cleanXeroMerchant(
      'Creek Road Auto',
      null,
      'ROT',
      undefined,
    )).toBe('Creek Road Auto')
  })

  it('skips 4-char GL code DISC in favour of reference', () => {
    expect(cleanXeroMerchant(
      'Some Supplier',
      null,
      'DISC',
      undefined,
    )).toBe('Some Supplier')
  })

  it('falls through to contact name when reference is also absent', () => {
    expect(cleanXeroMerchant(
      undefined,
      'Ampol Retail',
      'VRP',
      undefined,
    )).toBe('Ampol Retail')
  })

  it('falls through to narration when only GL code and narration available', () => {
    expect(cleanXeroMerchant(
      undefined,
      null,
      'CSH',
      'DISPUTE ADJUSTMENT',
    )).toBe('DISPUTE ADJUSTMENT')
  })
})

describe('cleanXeroMerchant — legitimate short values are kept', () => {
  it('keeps a 2-char line item desc that is numeric-looking (edge case: falls through)', () => {
    // Pure numbers are rejected by isNumeric check anyway
    expect(cleanXeroMerchant('BP SERVICE STATION', null, '42', undefined))
      .toBe('BP SERVICE STATION')
  })

  it('uses 5-char line item desc that passes the code check', () => {
    // 5 chars → not a Xero code → use it
    expect(cleanXeroMerchant(undefined, null, 'SUPER', undefined))
      .toBe('SUPER')
  })

  it('uses a meaningful line item description over reference', () => {
    expect(cleanXeroMerchant(
      'some-reference',
      null,
      'Consulting Services Jan 2026',
      undefined,
    )).toBe('Consulting Services Jan 2026')
  })

  it('returns Xero fallback when all fields are empty', () => {
    expect(cleanXeroMerchant(undefined, null, undefined, undefined))
      .toBe('Xero')
  })
})

describe('cleanXeroMerchant — BPAY normalisation', () => {
  it('normalises ATO BPAY reference to "ATO"', () => {
    expect(cleanXeroMerchant(
      '003009534934729521 COMMBANK APP BPA',
      null,
      undefined,
      undefined,
    )).toBe('ATO')
  })

  it('normalises ATO BPAY from narration when reference absent', () => {
    expect(cleanXeroMerchant(
      undefined,
      null,
      undefined,
      '003009534934729521 COMMBANK APP BPA',
    )).toBe('ATO')
  })

  it('does not normalise short numeric references (not a BPAY CRN)', () => {
    expect(cleanXeroMerchant(
      '12345 COMMBANK APP BPA',
      null,
      undefined,
      undefined,
    )).toBe('12345 COMMBANK APP BPA')
  })
})

describe('cleanXeroMerchant — priority order', () => {
  it('prefers line item description over reference when desc is meaningful', () => {
    expect(cleanXeroMerchant('ref-value', null, 'Better Description', undefined))
      .toBe('Better Description')
  })

  it('prefers reference over contact name', () => {
    expect(cleanXeroMerchant('The Reference', 'The Contact', undefined, undefined))
      .toBe('The Reference')
  })

  it('prefers contact name over narration', () => {
    expect(cleanXeroMerchant(undefined, 'The Contact', undefined, 'The Narration'))
      .toBe('The Contact')
  })
})
