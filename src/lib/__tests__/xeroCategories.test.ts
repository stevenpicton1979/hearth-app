import { describe, it, expect } from 'vitest'
import {
  mapXeroAccountToCategory,
  mapXeroTransactionClassification,
  shouldScopeAsHousehold,
  parseXeroDate,
  cleanXeroMerchant,
  composeXeroRawDescription,
} from '../xeroCategories'

describe('xeroCategories', () => {
  describe('mapXeroAccountToCategory', () => {
    it('maps EQUITY type to Director Income', () => {
      const category = mapXeroAccountToCategory('EQUITY', '3000', 'Director Drawings')
      expect(category).toBe('Director Income')
    })

    it('maps REVENUE type to Business', () => {
      const category = mapXeroAccountToCategory('REVENUE', '4100', 'Sales Revenue')
      expect(category).toBe('Business')
    })

    it('maps EXPENSE with advertising keyword to Shopping', () => {
      const category = mapXeroAccountToCategory('EXPENSE', '6200', 'Advertising Costs')
      expect(category).toBe('Shopping')
    })

    it('maps EXPENSE with travel keyword to Transport', () => {
      const category = mapXeroAccountToCategory('EXPENSE', '6300', 'Travel & Mileage')
      expect(category).toBe('Transport')
    })

    it('maps EXPENSE with meals keyword to Eating Out', () => {
      const category = mapXeroAccountToCategory('EXPENSE', '6400', 'Meals and Entertainment')
      expect(category).toBe('Eating Out')
    })

    it('maps EXPENSE with phone keyword to Technology', () => {
      const category = mapXeroAccountToCategory('EXPENSE', '6500', 'Phone and Internet')
      expect(category).toBe('Technology')
    })

    it('maps EXPENSE with insurance keyword to Insurance', () => {
      const category = mapXeroAccountToCategory('EXPENSE', '6600', 'Insurance Costs')
      expect(category).toBe('Insurance')
    })

    it('maps unknown EXPENSE to Business', () => {
      const category = mapXeroAccountToCategory('EXPENSE', '6700', 'Miscellaneous')
      expect(category).toBe('Business')
    })

    it('maps AU standard code 477 to Director Income', () => {
      expect(mapXeroAccountToCategory('EXPENSE', '477', 'Wages & Salaries')).toBe('Director Income')
    })

    it('maps AU standard code 493 to Transport', () => {
      expect(mapXeroAccountToCategory('EXPENSE', '493', 'Motor Vehicle')).toBe('Transport')
    })

    it('maps AU standard code 489 to Technology', () => {
      expect(mapXeroAccountToCategory('EXPENSE', '489', 'Subscriptions')).toBe('Technology')
    })

    it('maps AU standard code 420 to Eating Out', () => {
      expect(mapXeroAccountToCategory('EXPENSE', '420', 'Entertainment')).toBe('Eating Out')
    })

    it('maps AU standard code 433 to Insurance', () => {
      expect(mapXeroAccountToCategory('EXPENSE', '433', 'Insurance')).toBe('Insurance')
    })

    it('maps AU standard code 404 to Shopping', () => {
      expect(mapXeroAccountToCategory('EXPENSE', '404', 'Advertising')).toBe('Shopping')
    })

    it('code mapping takes priority over name keywords', () => {
      // code 489 = Technology, even if name says 'wages'
      expect(mapXeroAccountToCategory('EXPENSE', '489', 'wages software')).toBe('Technology')
    })
  })

  describe('mapXeroTransactionClassification', () => {
    it('maps SPEND to expense', () => {
      const classification = mapXeroTransactionClassification('SPEND')
      expect(classification).toBe('expense')
    })

    it('maps RECEIVE to income', () => {
      const classification = mapXeroTransactionClassification('RECEIVE')
      expect(classification).toBe('income')
    })

    it('returns null for unknown type', () => {
      const classification = mapXeroTransactionClassification('UNKNOWN')
      expect(classification).toBeNull()
    })
  })

  describe('shouldScopeAsHousehold', () => {
    it('returns true for EQUITY type', () => {
      const result = shouldScopeAsHousehold('EQUITY', 'Director Drawings')
      expect(result).toBe(true)
    })

    it('returns true for drawing keyword', () => {
      const result = shouldScopeAsHousehold('LIABILITY', 'Personal Drawing')
      expect(result).toBe(true)
    })

    it('returns false for regular expenses', () => {
      const result = shouldScopeAsHousehold('EXPENSE', 'Office Supplies')
      expect(result).toBe(false)
    })
  })

  describe('parseXeroDate', () => {
    it('parses Xero date format correctly', () => {
      const date = parseXeroDate('/Date(1682899200000)/')
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('returns current date for invalid format', () => {
      const date = parseXeroDate('invalid')
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('cleanXeroMerchant', () => {
    it('uses line item description when available', () => {
      const merchant = cleanXeroMerchant('REF123', 'Acme Corp', 'Invoice for services', undefined)
      expect(merchant).toBe('Invoice for services')
    })

    it('skips line item description that is just a number', () => {
      const merchant = cleanXeroMerchant('REF123', 'Acme Corp', '1234.56', undefined)
      expect(merchant).toBe('REF123')
    })

    it('uses reference over contact name', () => {
      const merchant = cleanXeroMerchant('REF123', 'Acme Corp', undefined, undefined)
      expect(merchant).toBe('REF123')
    })

    it('falls back to contact name when reference is empty', () => {
      const merchant = cleanXeroMerchant('', 'Acme Corp', undefined, undefined)
      expect(merchant).toBe('Acme Corp')
    })

    it('falls back to reference when contact name is null', () => {
      const merchant = cleanXeroMerchant('SUPPLIER REF', null, undefined, undefined)
      expect(merchant).toBe('SUPPLIER REF')
    })

    it('falls back to narration when reference and contact are empty', () => {
      const merchant = cleanXeroMerchant('', null, undefined, 'Payment narration')
      expect(merchant).toBe('Payment narration')
    })

    it('defaults to Xero when all fields are empty', () => {
      const merchant = cleanXeroMerchant('', null, undefined, undefined)
      expect(merchant).toBe('Xero')
    })

    it('trims whitespace', () => {
      const merchant = cleanXeroMerchant('  ', '  Company Name  ', undefined, undefined)
      expect(merchant).toBe('Company Name')
    })

    it('truncates to 100 characters', () => {
      const long = 'A'.repeat(150)
      const merchant = cleanXeroMerchant(long, null, undefined, undefined)
      expect(merchant).toHaveLength(100)
    })
  })

  describe('composeXeroRawDescription', () => {
    it('joins all non-empty fields with pipe separator', () => {
      const result = composeXeroRawDescription({
        contactName: 'Acme Corp',
        reference: 'INV-001',
        narration: 'Monthly fee',
        lineItemDescs: ['Consulting services'],
      })
      expect(result).toBe('Acme Corp | INV-001 | Monthly fee | Consulting services')
    })

    it('skips null and undefined fields', () => {
      const result = composeXeroRawDescription({
        contactName: 'Acme Corp',
        reference: null,
        narration: undefined,
        lineItemDescs: ['Software license'],
      })
      expect(result).toBe('Acme Corp | Software license')
    })

    it('returns null when all fields are empty or null', () => {
      const result = composeXeroRawDescription({
        contactName: null,
        reference: null,
        narration: undefined,
        lineItemDescs: [],
      })
      expect(result).toBeNull()
    })

    it('returns null when all fields are whitespace', () => {
      const result = composeXeroRawDescription({
        contactName: '  ',
        reference: ' ',
        narration: undefined,
        lineItemDescs: [''],
      })
      expect(result).toBeNull()
    })

    it('truncates to 500 characters', () => {
      const long = 'A'.repeat(300)
      const result = composeXeroRawDescription({ contactName: long, reference: long })
      expect(result).toHaveLength(500)
    })

    it('returns single field with no separator', () => {
      const result = composeXeroRawDescription({ reference: 'REF-123' })
      expect(result).toBe('REF-123')
    })

    it('includes bankAccountName', () => {
      const result = composeXeroRawDescription({
        contactName: 'Brisbane Health Tech',
        bankAccountName: 'Business Cheque Account',
      })
      expect(result).toBe('Brisbane Health Tech | Business Cheque Account')
    })

    it('omits bankAccountName when null', () => {
      const result = composeXeroRawDescription({
        contactName: 'Brisbane Health Tech',
        bankAccountName: null,
      })
      expect(result).toBe('Brisbane Health Tech')
    })

    it('deduplicates identical line item descriptions', () => {
      const result = composeXeroRawDescription({
        contactName: 'Acme Corp',
        lineItemDescs: ['Consulting', 'Consulting', 'Consulting'],
      })
      expect(result).toBe('Acme Corp | Consulting')
    })

    it('includes all unique line item descriptions', () => {
      const result = composeXeroRawDescription({
        lineItemDescs: ['Phase 1', 'Phase 2', 'Phase 3'],
      })
      expect(result).toBe('Phase 1 | Phase 2 | Phase 3')
    })

    it('includes tracking categories', () => {
      const result = composeXeroRawDescription({
        contactName: 'Acme Corp',
        tracking: ['Project: Infrastructure', 'Region: QLD'],
      })
      expect(result).toBe('Acme Corp | Project: Infrastructure | Region: QLD')
    })

    it('includes url', () => {
      const result = composeXeroRawDescription({
        contactName: 'Acme Corp',
        url: 'https://example.com/inv/001',
      })
      expect(result).toBe('Acme Corp | https://example.com/inv/001')
    })
  })
})
