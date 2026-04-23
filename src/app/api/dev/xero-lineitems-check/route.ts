import { NextResponse } from 'next/server'
import { getXeroConnection, getXeroBankTransactions } from '@/lib/xeroApi'

// One-shot diagnostic: counts BankTransactions with >1 LineItem.
// Call GET /api/dev/xero-lineitems-check once, report the result, then this route can be deleted.
export async function GET() {
  const connection = await getXeroConnection()
  if (!connection) {
    return NextResponse.json({ error: 'Xero not connected' }, { status: 400 })
  }

  const { transactions } = await getXeroBankTransactions(connection)

  let total = 0
  let multiLine = 0
  const samples: { id: string; type: string; lineCount: number }[] = []

  for (const tx of transactions) {
    total++
    const count = tx.LineItems?.length ?? 0
    if (count > 1) {
      multiLine++
      if (samples.length < 10) {
        samples.push({ id: tx.BankTransactionID, type: tx.Type, lineCount: count })
      }
    }
  }

  return NextResponse.json({ total, multiLine, singleLine: total - multiLine, samples })
}
