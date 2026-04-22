// TEMPORARY DEBUG ENDPOINT — remove after debugging Xero transaction field shapes
import { NextResponse } from 'next/server'
import { getXeroConnection, getXeroBankTransactions } from '@/lib/xeroApi'

export async function GET() {
  const connection = await getXeroConnection()
  if (!connection) return NextResponse.json({ error: 'not connected' }, { status: 400 })
  const { transactions } = await getXeroBankTransactions(connection)
  return NextResponse.json({ raw: transactions.slice(0, 5) })
}
