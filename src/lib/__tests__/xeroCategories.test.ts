import { describe, it, expect } from 'vitest'
import {
  mapXeroAccountToCategory,
  mapXeroTransactionClassification,
  shouldScopeAsHousehold,
  parseXeroDate,
  cleanXeroMerchant,
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
})
