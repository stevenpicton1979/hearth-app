import { describe, it, expect } from 'vitest'
import { composeXeroRawDescription } from '../xeroCategories'
import type { RawTransaction, ProcessedTransaction } from '../categoryPipeline'

describe('raw_description handling', () => {
  describe('composeXeroRawDescription', () => {
    it('composes all non-empty fields with pipe separator', () => {
      const result = composeXeroRawDescription('Acme Corp', 'INV-001', 'Monthly fee', 'Consulting services')
      expect(result).toBe('Acme Corp | INV-001 | Monthly fee | Consulting services')
    })

    it('filters out null and undefined fields', () => {
      const result = composeXeroRawDescription('Acme Corp', null, undefined, 'Software license')
      expect(result).toBe('Acme Corp | Software license')
    })

    it('filters out whitespace-only fields', () => {
      const result = composeXeroRawDescription('Acme Corp', '  ', '\t', 'Software')
      expect(result).toBe('Acme Corp | Software')
    })

    it('returns null when all fields are empty', () => {
      const result = composeXeroRawDescription(null, null, undefined, undefined)
      expect(result).toBeNull()
    })

    it('returns null when all fields are whitespace', () => {
      const result = composeXeroRawDescription('  ', ' ', undefined, '')
      expect(result).toBeNull()
    })

    it('truncates to 300 characters', () => {
      const long = 'A'.repeat(200)
      const result = composeXeroRawDescription(long, long, undefined, undefined)
      expect(result).toHaveLength(300)
    })

    it('handles single field gracefully', () => {
      const result = composeXeroRawDescription(null, 'REF-123', null, null)
      expect(result).toBe('REF-123')
    })

    it('preserves order: contactName > reference > narration > lineItemDesc', () => {
      const result = composeXeroRawDescription('Contact', 'Ref', 'Narration', 'LineItem')
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
        basiq_transaction_id: null,
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
        basiq_transaction_id: null,
        raw_description: 'Xero contact name | ref | narration',
        source: 'xero',
      }
      expect(tx.raw_description).toBe('Xero contact name | ref | narration')
      expect(tx.source).toBe('xero')
    })
  })
})
