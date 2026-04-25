import { NextResponse, NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { getXeroConnection, getXeroBankTransactions, getXeroAccounts } from '@/lib/xeroApi'
import {
  mapXeroAccountToCategory,
  parseXeroDate,
  cleanXeroMerchant,
  composeXeroRawDescription,
} from '@/lib/xeroCategories'
import { processBatch, upsertTransactions } from '@/lib/categoryPipeline'
import type { RawTransaction } from '@/lib/categoryPipeline'
import { linkTransferPairs } from '@/lib/transferLinker'
import { linkSalaryPairs } from '@/lib/salaryLinker'
import { applyXeroTransferRules, extractDestinationSuffix } from '@/lib/xeroTransferRules'
import type { XeroDestinationAccount } from '@/lib/xeroTransferRules'

// Sentinel used when a Xero transaction has no BankAccount.AccountID
const XERO_DEFAULT_ACCOUNT_ID = '__xero_default__'

export async function POST(req: NextRequest) {
  try {
    const connection = await getXeroConnection()
    if (!connection) {
      return NextResponse.json({ error: 'Xero not connected' }, { status: 400 })
    }

    const isFull = req.nextUrl.searchParams.get('full') === 'true'

    const supabase = createServerClient()

    // Read last_synced_at for incremental sync
    const { data: connRow } = await supabase
      .from('xero_connections')
      .select('last_synced_at')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .maybeSingle()
    const sinceDate = isFull ? undefined : (connRow?.last_synced_at ?? undefined)

    // Fetch all Xero bank transactions and the GL accounts map in parallel
    const [{ transactions }, accountsMap] = await Promise.all([
      getXeroBankTransactions(connection, sinceDate),
      getXeroAccounts(connection),
    ])

    if (transactions.length === 0) {
      return NextResponse.json({ synced: 0, skipped: 0, backfilled: 0, errors: [] })
    }

    // ----------------------------------------------------------------
    // Phase 1: Ensure a Hearth account exists for each Xero bank account.
    // Keyed by BankAccount.AccountID (stable Xero UUID) stored in the
    // xero_account_id column. Falls back to XERO_DEFAULT_ACCOUNT_ID for
    // any transactions that lack a BankAccount (should not happen in practice).
    // ----------------------------------------------------------------
    const xeroAccountNames = new Map<string, string>() // xeroAccId → display name

    for (const xTx of transactions) {
      const id = xTx.BankAccount?.AccountID ?? XERO_DEFAULT_ACCOUNT_ID
      if (!xeroAccountNames.has(id)) {
        xeroAccountNames.set(id, xTx.BankAccount?.Name ?? 'Xero (Business)')
      }
    }

    // For each unique Xero bank account, look up or create the Hearth account
    const bankAccountMap = new Map<string, string>() // xeroAccId → Hearth account UUID
    const errors: string[] = []

    for (const [xeroAccId, displayName] of Array.from(xeroAccountNames.entries())) {
      const { data: existing } = await supabase
        .from('accounts')
        .select('id')
        .eq('household_id', DEFAULT_HOUSEHOLD_ID)
        .eq('xero_account_id', xeroAccId)
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
            xero_account_id: xeroAccId,
          })
          .select('id')
          .single()

        if (error || !created) {
          errors.push(`Failed to create Xero account '${displayName}': ${error?.message ?? 'unknown'}`)
          continue
        }
        bankAccountMap.set(xeroAccId, created.id)
      }
    }

    if (bankAccountMap.size === 0) {
      return NextResponse.json({ error: 'Could not resolve any Xero bank accounts', errors }, { status: 500 })
    }

    // ----------------------------------------------------------------
    // Phase 1b: Load all account suffixes for the rule engine.
    // Used to resolve "Transfer to XX5426" → Hearth account during SPEND-TRANSFER.
    // ----------------------------------------------------------------
    const { data: accountRows } = await supabase
      .from('accounts')
      .select('id, account_suffix, scope, owner')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('is_active', true)
      .not('account_suffix', 'is', null)

    // Map suffix (uppercased) → { scope, owner }
    const suffixToAccount = new Map<string, XeroDestinationAccount>()
    for (const row of accountRows ?? []) {
      if (row.account_suffix) {
        suffixToAccount.set(row.account_suffix.toUpperCase(), {
          scope: row.scope ?? 'household',
          owner: row.owner ?? null,
        })
      }
    }

    // ----------------------------------------------------------------
    // Phase 2: Transform Xero transactions into RawTransaction rows.
    // One raw row per Xero bank transaction, routed to the correct account.
    // SPEND-TRANSFER rows are classified by the rule engine before being
    // passed to processBatch, so transfer-pattern detection in categoryPipeline
    // does not incorrectly flag wage/drawing descriptions as transfers.
    // ----------------------------------------------------------------
    const raws: RawTransaction[] = []

    for (const xTx of transactions) {
      try {
        const xeroAccId = xTx.BankAccount?.AccountID ?? XERO_DEFAULT_ACCOUNT_ID
        const hearthAccountId = bankAccountMap.get(xeroAccId)
        if (!hearthAccountId) continue // account creation failed — already recorded in errors

        const txType = xTx.Type ?? ''

        // RECEIVE-TRANSFER: do not store — the SPEND-TRANSFER on the other side
        // (already captured) is the canonical record.  We still process it for
        // link-confirmation purposes via the transferLinker below.
        if (txType === 'RECEIVE-TRANSFER') continue

        let totalAmount = 0
        let categoryHint: string | null = null

        for (const line of xTx.LineItems || []) {
          const unitAmount = line.UnitAmount || 0
          const qty = line.Quantity || 1
          totalAmount += unitAmount * qty

          if (line.AccountCode && accountsMap.has(line.AccountCode)) {
            const glAccount = accountsMap.get(line.AccountCode)!
            if (!categoryHint) {
              categoryHint = mapXeroAccountToCategory(glAccount.Type, glAccount.Code, glAccount.Name)
            }
          }
        }

        if (totalAmount === 0) continue

        const isSpend = txType === 'SPEND' || txType === 'SPEND-TRANSFER'
        const amount = isSpend ? -Math.abs(totalAmount) : Math.abs(totalAmount)
        const date = parseXeroDate(xTx.Date)

        const firstLineDesc = xTx.LineItems?.[0]?.Description
        const merchant = cleanXeroMerchant(
          xTx.Reference,
          xTx.Contact?.Name ?? null,
          firstLineDesc,
          xTx.Narration,
        )

        const allLineDescs = (xTx.LineItems || []).map(li => li.Description ?? null)
        const tracking = Array.from(new Set(
          (xTx.LineItems || [])
            .flatMap(li => li.Tracking || [])
            .map(t => `${t.Name}: ${t.Option}`)
        ))
        const rawDescription = composeXeroRawDescription({
          contactName: xTx.Contact?.Name,
          reference: xTx.Reference,
          narration: xTx.Narration,
          lineItemDescs: allLineDescs,
          bankAccountName: xTx.BankAccount?.Name,
          tracking,
          url: xTx.Url,
        })

        // For SPEND-TRANSFER, apply the rule engine to determine is_transfer,
        // category, and whether to flag for review.  For all other types
        // (SPEND / RECEIVE) let categoryPipeline handle categorisation normally.
        let forcedIsTransfer: boolean | undefined
        let ruleCategory: string | null = null
        let needsReview = false

        if (txType === 'SPEND-TRANSFER') {
          const narration = xTx.Narration ?? ''
          const reference = xTx.Reference ?? ''
          const searchText = `${narration} ${reference}`
          const suffix = extractDestinationSuffix(searchText)

          let destinationAccount: XeroDestinationAccount | null = null
          let suffixPresentButUnmatched = false

          if (suffix) {
            const matched = suffixToAccount.get(suffix.toUpperCase()