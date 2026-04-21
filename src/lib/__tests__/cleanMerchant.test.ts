import { describe, it, expect } from 'vitest'
import { cleanMerchant } from '../cleanMerchant'

describe('cleanMerchant - Merchant Cleaning', () => {
  describe('Direct Debit patterns', () => {
    it('extracts merchant name from Direct Debit with 4+ digit token', () => {
      const result = cleanMerchant('Direct Debit 123456 NETFLIX')
      expect(result).toBe('NETFLIX')
    })

    it('removes trailing 4+ digit token after Direct Debit merchant', () => {
      const result = cleanMerchant('Direct Debit 0987654321 WOOLWORTHS 1234567890')
      expect(result).toBe('WOOLWORTHS')
    })

    it('handles Direct Debit with underscore tokens', () => {
      const result = cleanMerchant('Direct Debit 123456 SPOTIFY sub_xyz')
      expect(result).toBe('SPOTIFY')
    })

    it('removes trailing underscore tokens after Direct Debit', () => {
      const result = cleanMerchant('Direct Debit 999999 ADOBE SYSTEMS_AUSTRALIA')
      expect(result).toBe('ADOBE')
    })

    it('normalises whitespace in Direct Debit descriptions', () => {
      const result = cleanMerchant('Direct Debit 123456 AMAZON   AU')
      expect(result).toBe('AMAZON AU')
    })

    it('converts Direct Debit result to uppercase', () => {
      const result = cleanMerchant('Direct Debit 123456 netflix')
      expect(result).toBe('NETFLIX')
    })
  })

  describe('Regular merchant patterns', () => {
    it('splits on 2+ spaces and takes first part', () => {
      const result = cleanMerchant('WOOLWORTHS  CARINDALE    QLD')
      expect(result).toBe('WOOLWORTHS')
    })

    it('removes trailing 6+ digit tokens', () => {
      const result = cleanMerchant('MYER 123456789')
      expect(result).toBe('MYER')
    })

    it('handles normal merchant with multiple spaces', () => {
      const result = cleanMerchant('BUNNINGS    GARDEN CENTER    1234567')
      expect(result).toBe('BUNNINGS')
    })

    it('normalises whitespace correctly', () => {
      const result = cleanMerchant('UBER   EATS')
      expect(result).toBe('UBER')
    })

    it('converts to uppercase', () => {
      const result = cleanMerchant('netflix subscription')
      expect(result).toBe('NETFLIX SUBSCRIPTION')
    })

    it('trims leading/trailing whitespace', () => {
      const result = cleanMerchant('  AMAZON AU  ')
      expect(result).toBe('AMAZON AU')
    })

    it('preserves single spaces in merchant name', () => {
      const result = cleanMerchant('APPLE MUSIC')
      expect(result).toBe('APPLE MUSIC')
    })
  })

  describe('Real CBA description formats', () => {
    it('handles CBA merchant with location - no 2+ spaces so full string kept', () => {
      const result = cleanMerchant('MCDONALD\'S #1234 BRISBANE QLD')
      // No 2+ spaces, so entire string is used; no 6+ digit token to remove
      expect(result).toBe('MCDONALD\'S #1234 BRISBANE QLD')
    })

    it('cleans up location info from supermarket - no 2+ spaces', () => {
      const result = cleanMerchant('COLES SOUTHBANK QLD AU')
      // No 2+ spaces, so entire string is kept
      expect(result).toBe('COLES SOUTHBANK QLD AU')
    })

    it('handles card transaction with merchant and location', () => {
      const result = cleanMerchant('KMART CARINDALE CENTRE QLD 4152')
      // No 2+ spaces, no 6+ digit token to remove (4152 is only 4 digits)
      expect(result).toBe('KMART CARINDALE CENTRE QLD 4152')
    })

    it('extracts airline name from booking reference', () => {
      const result = cleanMerchant('QANTAS AIRLINES 654321')
      // No 2+ spaces, 654321 is 6 digits so it gets removed
      expect(result).toBe('QANTAS AIRLINES')
    })

    it('handles subscription with multiple identifiers', () => {
      const result = cleanMerchant('SPOTIFY AUSTRALIA PTY LTD AU 987654')
      expect(result).toBe('SPOTIFY AUSTRALIA PTY LTD AU')
    })

    it('handles Direct Debit Telstra', () => {
      const result = cleanMerchant('Direct Debit 123456789 TELSTRA AUSTRALIA')
      expect(result).toBe('TELSTRA AUSTRALIA')
    })

    it('handles fuel station with location', () => {
      const result = cleanMerchant('BP AUSTRALIA SOUTH BRISBANE QLD 4101')
      // 4101 is only 4 digits, not 6+, so not removed
      expect(result).toBe('BP AUSTRALIA SOUTH BRISBANE QLD 4101')
    })

    it('cleans complex merchant name', () => {
      const result = cleanMerchant('OFFICEWORKS  CARINDALE    QLD')
      expect(result).toBe('OFFICEWORKS')
    })
  })

  describe('Edge cases', () => {
    it('handles empty string', () => {
      const result = cleanMerchant('')
      expect(result).toBe('')
    })

    it('handles single word merchant', () => {
      const result = cleanMerchant('NETFLIX')
      expect(result).toBe('NETFLIX')
    })

    it('handles merchant with only spaces', () => {
      const result = cleanMerchant('    ')
      expect(result).toBe('')
    })

    it('handles merchant with tabs and spaces', () => {
      const result = cleanMerchant('AMAZON  	  AU')
      expect(result).toBe('AMAZON')
    })

    it('preserves merchant with no trailing digits', () => {
      const result = cleanMerchant('NETFLIX SUBSCRIPTION')
      expect(result).toBe('NETFLIX SUBSCRIPTION')
    })

    it('handles numbers less than 4 digits in regular merchant', () => {
      const result = cleanMerchant('UBER 123 TRIP')
      expect(result).toBe('UBER 123 TRIP')
    })

    it('handles trailing space before digit token', () => {
      const result = cleanMerchant('MYER 123456')
      expect(result).toBe('MYER')
    })
  })
})
