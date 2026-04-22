import { NextResponse } from 'next/server'
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

export async function POST() {
  try {
    const connection = await getXeroConnection()
    if (!connection) {
      return NextResponse.json({ error: 'Xero not connected' }, { status: 400 })
    }

    const supabaseConn = createServerClient()
    const { data: connRow } = await supabaseConn
      .from('xero_connections')
      .select('last_synced_at')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .maybeSingle()
    const sinceDate = connRow?.last_synced_at ?? undefined

    const { transactions } = await getXeroBankTransactions(connection, sinceDate)
    console.log('XERO_DEBUG first 3 transactions:', JSON.stringify(transactions.slice(0, 3), null, 2))
    const accountsMap = await getXeroAccounts(connection)

    if (transactions.length === 0) {
      return NextResponse.json({ synced: 0, skipped: 0, errors: [] })
    }

    const supabase = createServerClient()

    // Phase 1: Resolve unique Xero bank accounts → Hearth account IDs
    const uniqueBankAccounts = new Map<string, string>() // xeroAccountId → display_name
    for (const xTx of transactions) {
      if (xTx.BankAccount?.AccountID && xTx.BankAccount?.Name) {
        uniqueBankAccounts.set(xTx.BankAccount.AccountID, xTx.BankAccount.Name)
      }
    }
    // Ensure fallback account for transactions with no BankAccount data
    const needsFallback = transactions.some(t => !t.BankAccount?.AccountID)
    if (needsFallback || uniqueBankAccounts.size === 0) {
      uniqueBankAccounts.set('__default__', 'Xero (Business)')
    }

    const bankAccountMap = new Map<string, string>() // xeroAccountId → Hearth account id
    for (const [xeroAccId, displayName] of uniqueBankAccounts) {
      const { data: existing } = await supabase
        .from('accounts')
        .select('id')
        .eq('household_id', DEFAULT_HOUSEHOLD_ID)
        .eq('institution', 'Xero')
        .eq('display_name', displayName)
        .maybeSingle()

      if (existing?.id) {
        bankAccountMap.set(xeroAccId, existing.id)
      } else {
        const { data: created, error } = await supabase
          .from('accounts')
          .insert({
            household_id: DEFAULT_HOUSEHOLD_ID,
            display_name: displayName,
            account_type: 'business_feed',
            institution: 'Xero',
            scope: 'business',
          })
          .select('id')
          .single()

        if (error) {
          return NextResponse.json({ error: `Failed to create Xero account: ${error.message}` }, { status: 500 })
        }
        bankAccountMap.set(xeroAccId, created.id)
      }
    }

    // Phase 2: Build raw transactions
    const raws: RawTransaction[] = []
    const errors: string[] = []

    for (const xTx of transactions) {
      try {
        // Skip RECEIVE-TRANSFER — transfers appear twice in Xero; only import SPEND-TRANSFER side
        if (xTx.Type === 'RECEIVE-TRANSFER') continue

        let totalAmount = 0
        let categoryHint: string | null = null

        for (const line of xTx.LineItems || []) {
          const unitAmount = line.UnitAmount || 0
          const qty = line.Quantity || 1
          totalAmount += unitAmount * qty

          if (line.AccountCode && accountsMap.has(line.AccountCode)) {
            const account = accountsMap.get(line.AccountCode)!
            if (!categoryHint) {
              categoryHint = mapXeroAccountToCategory(account.Type, account.Code, account.Name)
            }
          }
        }

        if (totalAmount === 0) continue

        const isTransfer = xTx.Type === 'SPEND-TRANSFER'
        const isSpend = xTx.Type === 'SPEND' || isTransfer
        const amount = isSpend ? -Math.abs(totalAmount) : Math.abs(totalAmount)

        const date = parseXeroDate(xTx.Date)
        const firstLineDesc = xTx.LineItems?.[0]?.Description
        let merchant = cleanXeroMerchant(xTx.Reference, xTx.Contact?.Name ?? null, firstLineDesc, xTx.Narration)
        if (xTx.Type === 'SPEND' && xTx.BankAccount?.Name) {
          merchant = `${merchant} → ${xTx.BankAccount.Name}`
        }

        const hearthAccountId = xTx.BankAccount?.AccountID
          ? (bankAccountMap.get(xTx.BankAccount.AccountID) ?? bankAccountMap.get('__default__'))
          : bankAccountMap.get('__default__')

        if (!hearthAccountId) continue

        raws.push({
          account_id: hearthAccountId,
          date,
          amount,
          description: merchant,
          is_transfer: isTransfer,
          category_hint: categoryHint,
        })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        errors.push(`Failed to process transaction ${xTx.BankTransactionID}: ${msg}`)
      }
    }

    const { toUpsert } = await processBatch(raws)

    const xeroTransactions = toUpsert.map(tx => ({
      ...tx,
      source: 'xero' as const,
    }))

    const { inserted, duplicates } = await upsertTransactions(xeroTransactions)

    const nowIso = new Date().toISOString()

    // Update last_synced_at on all Xero accounts for this household
    await supabase
      .from('accounts')
      .update({ last_synced_at: nowIso })
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('institution', 'Xero')

    await supabase
      .from('xero_connections')
      .update({ last_synced_at: nowIso })
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)

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
