import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { getXeroConnection, getXeroBankTransactions, getXeroAccounts } from '@/lib/xeroApi'
import {
  mapXeroAccountToCategory,
  parseXeroDate,
  cleanXeroMerchant,
} from '@/lib/xeroCategories'
import { processBatch, upsertTransactions } from '@/lib/categoryPipeline'
import type { RawTransaction } from '@/lib/categoryPipeline'

export async function POST(req: NextRequest) {
  try {
    // Get Xero connection (with auto-refresh)
    const connection = await getXeroConnection()
    if (!connection) {
      return NextResponse.json({ error: 'Xero not connected' }, { status: 400 })
    }

    // Fetch Xero bank transactions and accounts
    const { transactions } = await getXeroBankTransactions(connection)
    const accountsMap = await getXeroAccounts(connection)

    if (transactions.length === 0) {
      return NextResponse.json({ synced: 0, skipped: 0, errors: [] })
    }

    const supabase = createServerClient()

    // Ensure a Xero virtual account exists
    const { data: xeroAccount } = await supabase
      .from('accounts')
      .select('id')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('display_name', 'Xero (Business)')
      .maybeSingle()

    let accountId = xeroAccount?.id

    if (!accountId) {
      // Create Xero account
      const { data, error } = await supabase
        .from('accounts')
        .insert({
          household_id: DEFAULT_HOUSEHOLD_ID,
          display_name: 'Xero (Business)',
          account_type: 'business_feed',
          institution: 'Xero',
          scope: 'business',
        })
        .select('id')
        .single()

      if (error) {
        return NextResponse.json({ error: `Failed to create Xero account: ${error.message}` }, { status: 500 })
      }

      accountId = data.id
    }

    // Build raw transactions from Xero data
    const raws: RawTransaction[] = []
    const errors: string[] = []

    for (const xTx of transactions) {
      try {
        // Sum all line items to get total amount
        let totalAmount = 0
        let categoryHint: string | null = null
        let accountType = 'EXPENSE'

        for (const line of xTx.LineItems || []) {
          const unitAmount = line.UnitAmount || 0
          const qty = line.Quantity || 1
          totalAmount += unitAmount * qty

          // Get account info for category mapping
          if (line.AccountCode && accountsMap.has(line.AccountCode)) {
            const account = accountsMap.get(line.AccountCode)!
            accountType = account.Type
            if (!categoryHint) {
              categoryHint = mapXeroAccountToCategory(account.Type, account.Code, account.Name)
            }
          }
        }

        if (totalAmount === 0) continue

        // Determine amount sign based on transaction type
        const isSpend = xTx.Type === 'SPEND'
        const amount = isSpend ? -Math.abs(totalAmount) : Math.abs(totalAmount)

        const date = parseXeroDate(xTx.Date)
        const merchant = cleanXeroMerchant(xTx.Reference || '', xTx.Contact?.Name || null)

        raws.push({
          account_id: accountId,
          date,
          amount,
          description: merchant,
          is_transfer: false,
          category_hint: categoryHint,
        })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        errors.push(`Failed to process transaction ${xTx.BankTransactionID}: ${msg}`)
      }
    }

    // Process batch (apply merchant mappings, detect transfers, auto-categorize)
    const { toUpsert } = await processBatch(raws)

    // Add Xero-specific fields
    const xeroTransactions = toUpsert.map(tx => ({
      ...tx,
      source: 'xero' as const,
    }))

    // Upsert into database
    const { inserted, duplicates } = await upsertTransactions(xeroTransactions)

    // Update last_synced_at for the account
    await supabase
      .from('accounts')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', accountId)

    return NextResponse.json({
      synced: inserted,
      skipped: duplicates,
      errors,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
