import { describe, it, expect } from 'vitest'
import { composeXeroRawDescription } from '../xeroCategories'
import type { RawTransaction, ProcessedTransaction } from '../categoryPipeline'

describe('raw_description handling', () => {
  describe('composeXeroRawDescription', () => {
    it('composes all non-empty fields with pipe separator', () => {
      const result = composeXeroRawDescription({
        contactName: 'Acme Corp', reference: 'INV-001',
        narration: 'Monthly fee', lineItemDescs: ['Consulting services'],
      })
      expect(result).toBe('Acme Corp | INV-001 | Monthly fee | Consulting services')
    })

    it('filters out null and undefined fields', () => {
      const result = composeXeroRawDescription({
        contactName: 'Acme Corp', reference: null,
        narration: undefined, lineItemDescs: ['Software license'],
      })
      expect(result).toBe('Acme Corp | Software license')
    })

    it('filters out whitespace-only fields', () => {
      const result = composeXeroRawDescription({
        contactName: 'Acme Corp', reference: '  ',
        narration: '\t', lineItemDescs: ['Software'],
      })
      expect(result).toBe('Acme Corp | Software')
    })

    it('returns null when all fields are empty', () => {
      const result = composeXeroRawDescription({ contactName: null, reference: null })
      expect(result).toBeNull()
    })

    it('returns null when all fields are whitespace', () => {
      const result = composeXeroRawDescription({
        contactName: '  ', reference: ' ', lineItemDescs: [''],
      })
      expect(result).toBeNull()
    })

    it('truncates to 500 characters', () => {
      const long = 'A'.repeat(300)
      const result = composeXeroRawDescription({ contactName: long, reference: long })
      expect(result).toHaveLength(500)
    })

    it('handles single field gracefully', () => {
      const result = composeXeroRawDescription({ reference: 'REF-123' })
      expect(result).toBe('REF-123')
    })

    it('preserves order: contactName > reference > narration > lineItemDescs > bankAccountName > tracking > url', () => {
      const result = composeXeroRawDescription({
        contactName: 'Contact', reference: 'Ref',
        narration: 'Narration', lineItemDescs: ['LineItem'],
      })
      expect(result).toBe('Contact | Ref | Narration | LineItem')
    })
  })

  describe('raw_description in RawTransaction type', () => {
    it('should accept raw_description as optional field', () => {
      const tx: RawTransaction = {
        account_id: 'acc-1',
        date: '2024-01-01',
        amount: -100,
        description: 'Test',
        raw_description: 'Original description from bank',
      }
      expect(tx.raw_description).toBe('Original description from bank')
    })

    it('should accept undefined raw_description', () => {
      const tx: RawTransaction = {
        account_id: 'acc-1',
        date: '2024-01-01',
        amount: -100,
        description: 'Test',
      }
      expect(tx.raw_description).toBeUndefined()
    })

    it('should accept null raw_description', () => {
      const tx: RawTransaction = {
        account_id: 'acc-1',
        date: '2024-01-01',
        amount: -100,
        description: 'Test',
        raw_description: null,
      }
      expect(tx.raw_description).toBeNull()
    })
  })

  describe('raw_description in ProcessedTransaction type', () => {
    it('should accept raw_description as optional field', () => {
      const tx: ProcessedTransaction = {
        household_id: 'hh-1',
        account_id: 'acc-1',
        date: '2024-01-01',
        amount: -100,
        description: 'Test',
        merchant: 'Test Merchant',
        category: 'Food & Groceries',
        classification: null,
        is_transfer: false,
        external_id: null,
        raw_description: 'Original bank description or Xero fields',
      }
      expect(tx.raw_description).toBe('Original bank description or Xero fields')
    })

    it('should support source field along with raw_description', () => {
      const tx: ProcessedTransaction = {
        household_id: 'hh-1',
        account_id: 'acc-1',
        date: '2024-01-01',
        amount: -100,
        description: 'Test',
        merchant: 'Test Merchant',
        category: 'Food & Groceries',
        classification: null,
        is_transfer: false,
        external_id: null,
        raw_description: 'Xero contact name | ref | narration',
        source: 'xero',
      }
      expect(tx.raw_description).toBe('Xero contact name | ref | narration')
      expect(tx.source).toBe('xero')
    })
  })
})
