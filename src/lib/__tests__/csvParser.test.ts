import { describe, it, expect } from 'vitest'
import { parseCSV, extractBalance, extractNABAccountName } from '../csvParser'

describe('csvParser - Import Layer', () => {
  describe('parseCSV', () => {
    it('parses real CBA no-header CSV format', () => {
      const csv = `16/04/2026,"-23.14","WOOLWORTHS CARINDALE QLD","5234.56"
15/04/2026,"-45.50","NETFLIX CHARGE","5257.70"`
      const result = parseCSV(csv)
      expect(result).toHaveLength(2)
      expect(result[0].date).toBe('2026-04-16')
      expect(result[0].amount).toBe(-23.14)
    })

    it('extracts correct balance from column 3', () => {
      const csv = `16/04/2026,"-50.00","MERCHANT NAME","12345.67"`
      const result = parseCSV(csv)
      expect(result[0].balance).toBe(12345.67)
    })

    it('returns undefined balance for empty balance column', () => {
      const csv = `16/04/2026,"-50.00","MERCHANT NAME",""`
      const result = parseCSV(csv)
      expect(result).toHaveLength(1)
      expect(result[0].balance).toBeUndefined()
    })

    it('includes income rows (positive amounts) alongside expenses', () => {
      const csv = `16/04/2026,"50.00","SALARY DEPOSIT","5234.56"
15/04/2026,"-23.14","WOOLWORTHS","5184.56"`
      const result = parseCSV(csv)
      expect(result).toHaveLength(2)
      expect(result[0].amount).toBe(50.00)
      expect(result[0].category).toBeNull()
      expect(result[1].amount).toBe(-23.14)
    })

    it('skips zero-amount rows', () => {
      const csv = `16/04/2026,"0.00","FEE REVERSAL","5234.56"
15/04/2026,"-23.14","WOOLWORTHS","5184.56"`
      const result = parseCSV(csv)
      expect(result).toHaveLength(1)
      expect(result[0].amount).toBe(-23.14)
    })

    it('correctly parses negative amounts', () => {
      const csv = `16/04/2026,"-123.45","MYER","5000.00"
15/04/2026,"-0.99","COFFEE","5123.45"`
      const result = parseCSV(csv)
      expect(result).toHaveLength(2)
      expect(result[0].amount).toBe(-123.45)
      expect(result[1].amount).toBe(-0.99)
    })

    it('skips transfer patterns', () => {
      const csv = `16/04/2026,"-100.00","TRANSFER TO SAVINGS","5000.00"
14/04/2026,"-75.00","NORMAL MERCHANT","5150.00"`
      const result = parseCSV(csv)
      expect(result).toHaveLength(1)
      expect(result[0].description).toBe('NORMAL MERCHANT')
    })

    it('returns correct date format YYYY-MM-DD', () => {
      const csv = `01/01/2026,"-10.00","MERCHANT","1000.00"
31/12/2025,"-20.00","MERCHANT2","1010.00"`
      const result = parseCSV(csv)
      expect(result[0].date).toBe('2026-01-01')
      expect(result[1].date).toBe('2025-12-31')
    })

    it('attaches balance only to first transaction', () => {
      const csv = `16/04/2026,"-10.00","MERCHANT1","5000.00"
15/04/2026,"-20.00","MERCHANT2","4990.00"`
      const result = parseCSV(csv)
      expect(result[0].balance).toBe(5000.00)
      expect(result[1].balance).toBeUndefined()
    })

    it('handles empty CSV', () => {
      const result = parseCSV('')
      expect(result).toEqual([])
    })

    it('categorises merchants automatically', () => {
      const csv = `16/04/2026,"-20.00","NETFLIX","5000.00"
15/04/2026,"-50.00","WOOLWORTHS","4980.00"`
      const result = parseCSV(csv)
      expect(result[0].category).toBe('Entertainment')
      expect(result[1].category).toBe('Food & Groceries')
    })
  })

  describe('NAB credit card format', () => {
    const NAB_HEADER = 'Date,Amount,Account Number,,Transaction Type,Transaction Details,Balance,Category,Merchant Name,Processed On'

    it('parses NAB date "22 Jan 26" to 2026-01-22', () => {
      const csv = `${NAB_HEADER}
22 Jan 26,-83.22,Card ending 1687,,CREDIT CARD PURCHASE,Reddy Express 1809 Rocklea,-914.82,Fuel,Shell Coles Express (Rocklea),22 Jan 26`
      const result = parseCSV(csv)
      expect(result[0].date).toBe('2026-01-22')
    })

    it('parses NAB date "05 Dec 25" to 2025-12-05', () => {
      const csv = `${NAB_HEADER}
05 Dec 25,-45.00,Card ending 1687,,CREDIT CARD PURCHASE,MCDONALD'S,-960.00,Restaurants & takeaway,McDonald's,05 Dec 25`
      const result = parseCSV(csv)
      expect(result[0].date).toBe('2025-12-05')
    })

    it('marks CREDIT CARD PAYMENT rows as is_transfer=true', () => {
      const csv = `${NAB_HEADER}
22 Jan 26,19.35,Card ending 1687,,CREDIT CARD PAYMENT,INTERNET PAYMENT Linked Acc Trns,0.00,Internal transfers,,22 Jan 26`
      const result = parseCSV(csv)
      expect(result).toHaveLength(1)
      expect(result[0].is_transfer).toBe(true)
    })

    it('marks CREDIT CARD PURCHASE rows as is_transfer=false', () => {
      const csv = `${NAB_HEADER}
12 Jan 26,-83.22,Card ending 1687,,CREDIT CARD PURCHASE,Reddy Express 1809 Rocklea,-914.82,Fuel,Shell Coles Express (Rocklea),12 Jan 26`
      const result = parseCSV(csv)
      expect(result[0].is_transfer).toBe(false)
    })

    it('marks Internal transfers category as is_transfer=true', () => {
      const csv = `${NAB_HEADER}
10 Jan 26,100.00,Card ending 1687,,CREDIT CARD PAYMENT,Some payment,0.00,Internal transfers,,10 Jan 26`
      const result = parseCSV(csv)
      expect(result[0].is_transfer).toBe(true)
    })

    it('uses Merchant Name when non-empty', () => {
      const csv = `${NAB_HEADER}
12 Jan 26,-83.22,Card ending 1687,,CREDIT CARD PURCHASE,Reddy Express 1809 Rocklea,-914.82,Fuel,Shell Coles Express (Rocklea),12 Jan 26`
      const result = parseCSV(csv)
      expect(result[0].description).toBe('Shell Coles Express (Rocklea)')
    })

    it('falls back to Transaction Details when Merchant Name is empty', () => {
      const csv = `${NAB_HEADER}
22 Jan 26,19.35,Card ending 1687,,CREDIT CARD PAYMENT,INTERNET PAYMENT Linked Acc Trns,0.00,Internal transfers,,22 Jan 26`
      const result = parseCSV(csv)
      expect(result[0].description).toBe('INTERNET PAYMENT Linked Acc Trns')
    })

    it('maps NAB category "Fuel" to Transport', () => {
      const csv = `${NAB_HEADER}
12 Jan 26,-83.22,Card ending 1687,,CREDIT CARD PURCHASE,Reddy Express,-914.82,Fuel,Shell Coles Express,12 Jan 26`
      const result = parseCSV(csv)
      expect(result[0].category).toBe('Transport')
    })

    it('maps NAB category "Restaurants & takeaway" to Eating Out', () => {
      const csv = `${NAB_HEADER}
10 Jan 26,-25.00,Card ending 1687,,CREDIT CARD PURCHASE,MCDONALD'S,-940.00,Restaurants & takeaway,McDonald's,10 Jan 26`
      const result = parseCSV(csv)
      expect(result[0].category).toBe('Eating Out')
    })

    it('maps NAB category "Groceries" to Food & Groceries', () => {
      const csv = `${NAB_HEADER}
08 Jan 26,-120.00,Card ending 1687,,CREDIT CARD PURCHASE,WOOLWORTHS,-1060.00,Groceries,Woolworths,08 Jan 26`
      const result = parseCSV(csv)
      expect(result[0].category).toBe('Food & Groceries')
    })

    it('sets null category for transfer rows', () => {
      const csv = `${NAB_HEADER}
22 Jan 26,19.35,Card ending 1687,,CREDIT CARD PAYMENT,INTERNET PAYMENT Linked Acc Trns,0.00,Internal transfers,,22 Jan 26`
      const result = parseCSV(csv)
      expect(result[0].category).toBeNull()
    })
  })

  describe('extractNABAccountName', () => {
    const NAB_HEADER = 'Date,Amount,Account Number,,Transaction Type,Transaction Details,Balance,Category,Merchant Name,Processed On'

    it('extracts account name from Card ending digits', () => {
      const csv = `${NAB_HEADER}
12 Jan 26,-83.22,Card ending 1687,,CREDIT CARD PURCHASE,Reddy Express,-914.82,Fuel,Shell Coles Express,12 Jan 26`
      expect(extractNABAccountName(csv)).toBe('NAB Credit Card (\u00b71687)')
    })

    it('returns null for CBA CSV', () => {
      const csv = `16/04/2026,"-23.14","WOOLWORTHS","5234.56"`
      expect(extractNABAccountName(csv)).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(extractNABAccountName('')).toBeNull()
    })
  })

  describe('extractBalance', () => {
    it('extracts balance from first data row', () => {
      const csv = `16/04/2026,"-23.14","MERCHANT","5234.56"
15/04/2026,"-45.50","MERCHANT2","5257.70"`
      const balance = extractBalance(csv)
      expect(balance).toBe(5234.56)
    })

    it('returns undefined when balance column is empty', () => {
      const csv = `16/04/2026,"-23.14","MERCHANT",""`
      const balance = extractBalance(csv)
      expect(balance).toBeUndefined()
    })

    it('returns undefined for empty CSV', () => {
      const balance = extractBalance('')
      expect(balance).toBeUndefined()
    })

    it('extracts balance regardless of transfer status', () => {
      const csv = `16/04/2026,"-100.00","TRANSFER TO SAVINGS","5234.56"
15/04/2026,"-45.50","MERCHANT2","5334.56"`
      const balance = extractBalance(csv)
      expect(balance).toBe(5234.56)
    })

    it('extracts balance regardless of income rows', () => {
      const csv = `16/04/2026,"1000.00","SALARY","5234.56"
15/04/2026,"-45.50","MERCHANT2","4234.56"`
      const balance = extractBalance(csv)
      expect(balance).toBe(5234.56)
    })
  })
})
