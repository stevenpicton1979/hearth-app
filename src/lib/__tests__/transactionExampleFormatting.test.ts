import { describe, it, expect } from 'vitest'

/**
 * Tests for transaction example formatting in dev/training page.
 *
 * Bug fixes covered:
 * 1. FROM/TO reversed for credit transactions (Bug 1) — credits always swap FROM/TO
 * 2. Unlinked transfer rows excluded by de-dup (Bug 2) — de-dup key includes amount
 */

interface ExampleData {
  account?: string | null
  amount: number | null
  merchant?: string | null
  transfer_destination?: string | null
}

/**
 * Replicates the fromLabel/toLabel logic from ExampleCard.
 * Credits: FROM = sender (transferDest ?? merchant), TO = receiving account
 * Debits:  FROM = spending account, TO = recipient (transferDest ?? merchant)
 */
function getTransactionLabels(ex: ExampleData) {
  const account = ex.account || '—'
  const merchant = ex.merchant || '—'
  const amount = ex.amount
  const transferDest = ex.transfer_destination ?? null

  const isCredit = amount !== null && amount > 0
  const fromLabel = isCredit ? (transferDest ?? merchant) : account
  const toLabel   = isCredit ? account : (transferDest ?? merchant)

  return { fromLabel, toLabel, isCredit }
}

/**
 * Replicates the de-dup logic from merchant-examples/route.ts.
 * Key is (description|amount) so different-amount rows with the same description
 * are treated as distinct examples.
 */
function deduplicateExamples(
  rows: Array<{ raw_description?: string; description?: string; amount?: number; is_transfer?: boolean; linked_transfer_id?: string | null }>
): typeof rows {
  const seen = new Set<string>()
  const result: typeof rows = []
  for (const row of rows) {
    if (row.is_transfer || row.linked_transfer_id) {
      result.push(row)
      if (result.length >= 5) break
      continue
    }
    const raw = (row.raw_description ?? '').trim()
    const cleaned = (row.description ?? '').trim()
    const key = `${raw || cleaned}|${row.amount}`
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(row)
    if (result.length >= 5) break
  }
  return result
}

// ─── Label formatting ─────────────────────────────────────────────────────────

describe('getTransactionLabels', () => {
  describe('Credit transfers (money IN)', () => {
    it('credit with transferDest: FROM=sender account, TO=receiving account', () => {
      const { fromLabel, toLabel, isCredit } = getTransactionLabels({
        account: 'Brisbane Health Tech',
        amount: 10000,
        merchant: 'D E',
        transfer_destination: 'D E Personal',
      })

      expect(isCredit).toBe(true)
      expect(fromLabel).toBe('D E Personal')
      expect(toLabel).toBe('Brisbane Health Tech')
    })

    it('credit without transferDest: FROM=merchant name (sender), TO=account (receiver)', () => {
      // Bug 1 regression: before fix, credits with no transferDest showed FROM=account, TO=merchant (inverted)
      const { fromLabel, toLabel, isCredit } = getTransactionLabels({
        account: 'Brisbane Health Tech',
        amount: 10000,
        merchant: 'D E',
        transfer_destination: null,
      })

      expect(isCredit).toBe(true)
      expect(fromLabel).toBe('D E')             // merchant is the sender
      expect(toLabel).toBe('Brisbane Health Tech') // account is the receiver
    })

    it('credit without transferDest undefined: FROM=merchant, TO=account', () => {
      const { fromLabel, toLabel } = getTransactionLabels({
        account: 'My Account',
        amount: 5000,
        merchant: 'Unknown Sender',
        transfer_destination: undefined,
      })

      expect(fromLabel).toBe('Unknown Sender')
      expect(toLabel).toBe('My Account')
    })
  })

  describe('Debit transfers (money OUT)', () => {
    it('debit with transferDest: FROM=spending account, TO=recipient account', () => {
      const { fromLabel, toLabel, isCredit } = getTransactionLabels({
        account: 'Brisbane Health Tech',
        amount: -10000,
        merchant: 'D E',
        transfer_destination: 'D E Personal',
      })

      expect(isCredit).toBe(false)
      expect(fromLabel).toBe('Brisbane Health Tech')
      expect(toLabel).toBe('D E Personal')
    })

    it('debit without transferDest: FROM=account, TO=merchant', () => {
      const { fromLabel, toLabel, isCredit } = getTransactionLabels({
        account: 'My Account',
        amount: -1500,
        merchant: 'NETFLIX',
        transfer_destination: undefined,
      })

      expect(isCredit).toBe(false)
      expect(fromLabel).toBe('My Account')
      expect(toLabel).toBe('NETFLIX')
    })
  })

  describe('Edge cases', () => {
    it('zero amount is treated as debit (not credit)', () => {
      const { isCredit, fromLabel, toLabel } = getTransactionLabels({
        account: 'My Account',
        amount: 0,
        merchant: 'Test',
        transfer_destination: 'Other Account',
      })

      expect(isCredit).toBe(false)
      expect(fromLabel).toBe('My Account')
      expect(toLabel).toBe('Other Account')
    })

    it('null amount is treated as debit', () => {
      const { isCredit, fromLabel, toLabel } = getTransactionLabels({
        account: 'My Account',
        amount: null,
        merchant: 'Test',
        transfer_destination: 'Other Account',
      })

      expect(isCredit).toBe(false)
      expect(fromLabel).toBe('My Account')
      expect(toLabel).toBe('Other Account')
    })

    it('null account falls back to —', () => {
      const { fromLabel, toLabel } = getTransactionLabels({
        account: null,
        amount: 1000,
        merchant: 'Test',
        transfer_destination: undefined,
      })

      // credit: FROM=merchant, TO=account(—)
      expect(fromLabel).toBe('Test')
      expect(toLabel).toBe('—')
    })

    it('null merchant falls back to — for debits', () => {
      const { fromLabel, toLabel } = getTransactionLabels({
        account: 'My Account',
        amount: -500,
        merchant: null,
        transfer_destination: undefined,
      })

      expect(fromLabel).toBe('My Account')
      expect(toLabel).toBe('—')
    })
  })
})

// ─── De-dup logic ─────────────────────────────────────────────────────────────

describe('deduplicateExamples', () => {
  it('keeps distinct descriptions', () => {
    const rows = [
      { description: 'NETFLIX', amount: 20 },
      { description: 'SPOTIFY', amount: 15 },
    ]
    expect(deduplicateExamples(rows)).toHaveLength(2)
  })

  it('collapses same description AND same amount to one row', () => {
    const rows = [
      { description: 'D E', amount: 5000 },
      { description: 'D E', amount: 5000 },
    ]
    expect(deduplicateExamples(rows)).toHaveLength(1)
  })

  it('keeps rows with same description but different amount as distinct examples', () => {
    // Bug 2 regression: before fix, the $10k transfer was collapsed with the $5k income row
    const rows = [
      { description: 'D E', amount: 5000 },
      { description: 'D E', amount: 10000 },
    ]
    expect(deduplicateExamples(rows)).toHaveLength(2)
  })

  it('transfer rows (is_transfer=true) always bypass de-dup', () => {
    const rows = [
      { description: 'Transfer', amount: 5000, is_transfer: true },
      { description: 'Transfer', amount: 5000, is_transfer: true },
    ]
    expect(deduplicateExamples(rows)).toHaveLength(2)
  })

  it('rows with linked_transfer_id always bypass de-dup', () => {
    const rows = [
      { description: 'Transfer', amount: 5000, linked_transfer_id: 'abc-123' },
      { description: 'Transfer', amount: 5000, linked_transfer_id: 'def-456' },
    ]
    expect(deduplicateExamples(rows)).toHaveLength(2)
  })

  it('is_transfer=false, linked_transfer_id=null rows are de-duped normally', () => {
    // These are regular (non-transfer) income/expense rows
    const rows = [
      { description: 'SALARY', amount: 5000, is_transfer: false, linked_transfer_id: null },
      { description: 'SALARY', amount: 5000, is_transfer: false, linked_transfer_id: null },
    ]
    expect(deduplicateExamples(rows)).toHaveLength(1)
  })

  it('caps results at 5', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ description: `MERCHANT_${i}`, amount: 100 }))
    expect(deduplicateExamples(rows)).toHaveLength(5)
  })
})
