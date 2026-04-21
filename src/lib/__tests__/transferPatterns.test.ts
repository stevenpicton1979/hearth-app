import { describe, it, expect } from 'vitest'
import { isTransfer } from '../transferPatterns'

describe('transferPatterns - Transfer Detection', () => {
  describe('isTransfer - should return true for transfer patterns', () => {
    it('detects "TRANSFER" at start', () => {
      expect(isTransfer('TRANSFER TO SAVINGS')).toBe(true)
    })

    it('detects "transfer to" pattern', () => {
      expect(isTransfer('transfer to checking')).toBe(true)
    })

    it('detects "transfer from" pattern', () => {
      expect(isTransfer('Transfer from main account')).toBe(true)
    })

    it('detects ATM at start', () => {
      expect(isTransfer('ATM WITHDRAWAL')).toBe(true)
    })

    it('detects "ATM withdrawal" pattern', () => {
      expect(isTransfer('atm withdrawal at the mall')).toBe(true)
    })

    it('detects "ATM cash" pattern', () => {
      expect(isTransfer('ATM CASH WITHDRAWAL')).toBe(true)
    })

    it('detects EFT at start', () => {
      expect(isTransfer('EFT PAYMENT')).toBe(true)
    })

    it('detects OSKO at start', () => {
      expect(isTransfer('OSKO TRANSFER')).toBe(true)
    })

    it('detects NPE pattern', () => {
      expect(isTransfer('NPE PAYMENT')).toBe(true)
    })

    it('detects PayID pattern', () => {
      expect(isTransfer('PAYID TRANSFER')).toBe(true)
    })

    it('detects "pay anyone" at start', () => {
      expect(isTransfer('PAY ANYONE TO JOHN')).toBe(true)
    })

    it('detects "internal transfer" at start', () => {
      expect(isTransfer('INTERNAL TRANSFER')).toBe(true)
    })

    it('detects SWEEP at start', () => {
      expect(isTransfer('SWEEP ACCOUNT')).toBe(true)
    })

    it('detects "auto transfer" at start', () => {
      expect(isTransfer('AUTO TRANSFER TO SAVINGS')).toBe(true)
    })

    it('detects "scheduled transfer" at start', () => {
      expect(isTransfer('SCHEDULED TRANSFER')).toBe(true)
    })

    it('detects "self transfer" pattern', () => {
      expect(isTransfer('SELF TRANSFER BETWEEN ACCOUNTS')).toBe(true)
    })

    it('detects "loan repayment" pattern', () => {
      expect(isTransfer('LOAN REPAYMENT')).toBe(true)
    })

    it('detects "mortgage repayment" pattern', () => {
      expect(isTransfer('MORTGAGE REPAYMENT TO LENDER')).toBe(true)
    })

    it('detects "ln repay" pattern', () => {
      expect(isTransfer('LN REPAY ACCOUNT 123')).toBe(true)
    })

    it('detects REFUND at start', () => {
      expect(isTransfer('REFUND PROCESSED')).toBe(true)
    })

    it('detects "credit card payment" pattern', () => {
      expect(isTransfer('CREDIT CARD PAYMENT')).toBe(true)
    })

    it('detects "card payment" pattern', () => {
      expect(isTransfer('CARD PAYMENT TO VISA')).toBe(true)
    })

    it('detects "WDL ATM" at start', () => {
      expect(isTransfer('WDL ATM WITHDRAWAL')).toBe(true)
    })

    it('detects "mycard credit" at start', () => {
      expect(isTransfer('MYCARD CREDIT')).toBe(true)
    })

    it('detects "citibank credit" at start', () => {
      expect(isTransfer('CITIBANK CREDIT TRANSFER')).toBe(true)
    })

    it('detects "overdraw fee" pattern', () => {
      expect(isTransfer('OVERDRAW FEE')).toBe(true)
    })

    it('detects "debit excess" pattern', () => {
      expect(isTransfer('DEBIT EXCESS CHARGE')).toBe(true)
    })

    it('detects "return no account" pattern', () => {
      expect(isTransfer('RETURN NO ACCOUNT')).toBe(true)
    })

    it('detects "payment received" pattern', () => {
      expect(isTransfer('PAYMENT RECEIVED')).toBe(true)
    })

    it('detects "dispute adjustment" pattern', () => {
      expect(isTransfer('DISPUTE ADJUSTMENT')).toBe(true)
    })

    it('detects "intnl trans" pattern', () => {
      expect(isTransfer('INTNL TRANS FEE')).toBe(true)
    })

    it('detects "fast transfer" at start', () => {
      expect(isTransfer('FAST TRANSFER')).toBe(true)
    })
  })

  describe('isTransfer - should return false for normal merchants', () => {
    it('returns false for NETFLIX', () => {
      expect(isTransfer('NETFLIX')).toBe(false)
    })

    it('returns false for WOOLWORTHS', () => {
      expect(isTransfer('WOOLWORTHS CARINDALE')).toBe(false)
    })

    it('returns false for MYER', () => {
      expect(isTransfer('MYER SHOPPING CENTRE')).toBe(false)
    })

    it('returns false for UBER', () => {
      expect(isTransfer('UBER TRIP')).toBe(false)
    })

    it('returns false for MCDONALD\'S', () => {
      expect(isTransfer('MCDONALDS BRISBANE')).toBe(false)
    })

    it('returns false for AMAZON', () => {
      expect(isTransfer('AMAZON AU')).toBe(false)
    })

    it('returns false for generic merchant', () => {
      expect(isTransfer('SOME RANDOM MERCHANT')).toBe(false)
    })

    it('returns false for airline booking', () => {
      expect(isTransfer('QANTAS AIRLINES BOOKING')).toBe(false)
    })

    it('returns false for grocery shopping', () => {
      expect(isTransfer('COLES SUPERMARKET')).toBe(false)
    })

    it('returns false for utility payment', () => {
      expect(isTransfer('ENERGEX ELECTRICITY')).toBe(false)
    })

    it('returns false for ATO tax payment', () => {
      expect(isTransfer('TAX OFFICE PAYMENT')).toBe(false)
    })

    it('returns false for BPAY ATO payment', () => {
      expect(isTransfer('BPAY TAX OFFICE PAYMENTS COM')).toBe(false)
    })

    it('returns false for council rates', () => {
      expect(isTransfer('BCC RATES PAYMENT')).toBe(false)
    })

    it('returns false for similar but distinct descriptions', () => {
      expect(isTransfer('TRANSFERWISE PAYMENT')).toBe(false)
    })

    it('matches transfer at word boundary - hyphen counts as word boundary', () => {
      expect(isTransfer('TRANSFER-RELATED SERVICE')).toBe(true)
    })
  })

  describe('isTransfer - case insensitivity', () => {
    it('matches transfer patterns case-insensitively', () => {
      expect(isTransfer('transfer to savings')).toBe(true)
      expect(isTransfer('TRANSFER TO SAVINGS')).toBe(true)
      expect(isTransfer('Transfer To Savings')).toBe(true)
    })

    it('matches atm patterns case-insensitively', () => {
      expect(isTransfer('atm withdrawal')).toBe(true)
      expect(isTransfer('ATM WITHDRAWAL')).toBe(true)
      expect(isTransfer('Atm Withdrawal')).toBe(true)
    })
  })

  describe('isTransfer - boundary matching', () => {
    it('matches "transfer" only at word boundary', () => {
      expect(isTransfer('NOTTRANSFER')).toBe(false)
      expect(isTransfer('TRANSFERX')).toBe(false)
    })

    it('matches "atm" only at word boundary', () => {
      expect(isTransfer('XATM')).toBe(false)
      expect(isTransfer('ATMX')).toBe(false)
    })
  })
})
