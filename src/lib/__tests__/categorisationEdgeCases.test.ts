import { describe, it, expect } from 'vitest'
import { guessCategory } from '../autoCategory'
import { isTransfer } from '../transferPatterns'

describe('categorisationEdgeCases - Government & Tax', () => {
  it('ATO payment via BPAY is categorised as Government & Tax, not Transport', () => {
    expect(guessCategory('BPAY TAX OFFICE PAYMENTS COM')).toBe('Government & Tax')
  })

  it('ATO direct payment is Government & Tax', () => {
    expect(guessCategory('ATO AUSTRALIA TAX')).toBe('Government & Tax')
  })

  it('Council rates are Government & Tax', () => {
    expect(guessCategory('BCC RATES ANNUAL NOTICE')).toBe('Government & Tax')
  })

  it('Government & Tax payments are not flagged as transfers', () => {
    expect(isTransfer('TAX OFFICE PAYMENT')).toBe(false)
    expect(isTransfer('BPAY TAX OFFICE PAYMENTS COM')).toBe(false)
    expect(isTransfer('BCC RATES PAYMENT')).toBe(false)
  })
})

describe('categorisationEdgeCases - BP fuel vs BPAY', () => {
  it('BP petrol station is Transport', () => {
    expect(guessCategory('BP AUSTRALIA PETROL')).toBe('Transport')
  })

  it('BPAY prefix does not trigger Transport category', () => {
    const result = guessCategory('BPAY COUNCIL PAYMENT')
    expect(result).not.toBe('Transport')
  })
})

describe('categorisationEdgeCases - income passthrough', () => {
  it('guessCategory returns null for unknown merchants (income will have no category)', () => {
    expect(guessCategory('PAYROLL DEPOSIT')).toBeNull()
    expect(guessCategory('EMPLOYER SALARY CREDIT')).toBeNull()
  })
})

describe('categorisationEdgeCases - transfer detection correctness', () => {
  it('OSKO transfers are flagged', () => {
    expect(isTransfer('OSKO PAYMENT')).toBe(true)
  })

  it('regular salary deposit is not a transfer', () => {
    expect(isTransfer('SALARY DEPOSIT')).toBe(false)
  })

  it('internal transfer is flagged', () => {
    expect(isTransfer('INTERNAL TRANSFER SAVINGS')).toBe(true)
  })

  it('PAYID payment is flagged as transfer', () => {
    expect(isTransfer('PAYID TRANSFER')).toBe(true)
  })

  it('ATO payment is NOT flagged as transfer', () => {
    expect(isTransfer('ATO AUSTRALIA TAX PAYMENT')).toBe(false)
  })
})
