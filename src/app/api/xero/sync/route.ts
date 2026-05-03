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

const XERO_DEFAULT_ACCOUNT_ID = '__xero_default__'

// Vercel Pro: allow up to 5 minutes for a full sync
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const connection = await getXeroConnection()
    if (!connection) {
      return NextResponse.json({ error: 'Xero not connected' }, { status: 400 })
    }

    const isFull = req.nextUrl.searchParams.get('full') === 'true'

    const supabase = createServerClient()

    const { data: connRow } = await supabase
      .from('xero_connections')
      .select('last_synced_at')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .maybeSingle()
    const sinceDate = isFull ? undefined : (connRow?.last_synced_at ?? undefined)

    // Kick off accounts map fetch immediately (needed for GL account categorisation).
    const accountsMapPromise = getXeroAccounts(connection)

    // Fetch bank transactions — per-account for full syncs, global for incremental.
    type TxList = Awaited<ReturnType<typeof getXeroBankTransactions>>['transactions']
    let transactions: TxList

    if (isFull) {
      const { data: knownXeroAccts } = await supabase
        .from('accounts')
        .select('xero_account_id')
        .eq('household_id', DEFAULT_HOUSEHOLD_ID)
        .eq('institution', 'Xero')
        .not('xero_account_id', 'is', null)

      const knownIds = (knownXeroAccts ?? [])
        .map(a => a.xero_account_id as string)
        .filter(id => !!id && id !== XERO_DEFAULT_ACCOUNT_ID)

      if (knownIds.length > 0) {
        const txnById = new Map<string, TxList[0]>()
        for (const accId of knownIds) {
          const { transactions: batch } = await getXeroBankTransactions(connection, undefined, accId)
          for (const tx of batch) {
            txnById.set(tx.BankTransactionID, tx)
          }
        }
        transactions = Array.from(txnById.values())
      } else {
        // No known Xero accounts yet — first sync, use global fetch
        ;({ transactions } = await getXeroBankTransactions(connection))
      }
    } else {
      ;({ transactions } = await getXeroBankTransactions(connection, sinceDate))
    }

    const accountsMap = await accountsMapPromise

    if (transactions.length === 0) {
      return NextResponse.json({ synced: 0, skipped: 0, backfilled: 0, errors: [] })
    }

    // ----------------------------------------------------------------
    // Phase 1: Ensure a Hearth account exists for each Xero bank account.
    // ----------------------------------------------------------------
    const xeroAccountNames = new Map<string, string>()

    for (const xTx of transactions) {
      const id = xTx.BankAccount?.AccountID ?? XERO_DEFAULT_ACCOUNT_ID
      if (!xeroAccountNames.has(id)) {
        xeroAccountNames.set(id, xTx.BankAccount?.Name ?? 'Xero (Business)')
      }
    }

    const bankAccountMap = new Map<string, string>()
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
    // ----------------------------------------------------------------
    const { data: accountRows } = await supabase
      .from('accounts')
      .select('id, account_suffix, scope, owner')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('is_active', true)
      .not('account_suffix', 'is', null)

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
    // ----------------------------------------------------------------
    const raws: RawTransaction[] = []

    for (const xTx of transactions) {
      try {
        const xeroAccId = xTx.BankAccount?.AccountID ?? XERO_DEFAULT_ACCOUNT_ID
        const hearthAccountId = bankAccountMap.get(xeroAccId)
        if (!hearthAccountId) continue

        const txType = xTx.Type ?? ''

        // RECEIVE-TRANSFER: skip — SPEND-TRANSFER on the other side is the canonical record.
        if (txType === 'RECEIVE-TRANSFER') continue

        let totalAmount = 0
        let categoryHint: string | null = null
        let glAccountName: string | null = null
        let glTaxType: string | null = null

        for (const line of xTx.LineItems || []) {
          const unitAmount = line.UnitAmount || 0
          const qty = line.Quantity || 1
          totalAmount += unitAmount * qty

          if (line.AccountCode && accountsMap.has(line.AccountCode)) {
            const glAccount = accountsMap.get(line.AccountCode)!
            if (!categoryHint) {
              categoryHint = mapXeroAccountToCategory(glAccount.Type, glAccount.Code, glAccount.Name)
              glAccountName = glAccount.Name
            }
          }
          if (!glTaxType && line.TaxType) {
            glTaxType = line.TaxType
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

        // For SPEND-TRANSFER, apply the rule engine.
        let forcedIsTransfer: boolean | undefined
        let ruleCategory: string | null = null
        let needsReview = false
        let xeroMatchedRule: string | null = null

        if (txType === 'SPEND-TRANSFER') {
          const narration = xTx.Narration ?? ''
          const reference = xTx.Reference ?? ''
          const searchText = `${narration} ${reference}`
          const suffix = extractDestinationSuffix(searchText)

          let destinationAccount: XeroDestinationAccount | null = null
          let suffixPresentButUnmatched = false

          if (suffix) {
            const matched = suffixToAccount.get(suffix.toUpperCase())
            if (matched) {
              destinationAccount = matched
            } else {
              suffixPresentButUnmatched = true
            }
          }

          const outcome = applyXeroTransferRules({
            narration,
            reference,
            destinationAccount,
            suffixPresentButUnmatched,
          })

          forcedIsTransfer = outcome.is_transfer
          ruleCategory = outcome.category
          needsReview = outcome.needs_review
          xeroMatchedRule = 'xero:' + outcome.ruleName
        }

        raws.push({
          account_id: hearthAccountId,
          date,
          amount,
          description: merchant,
          external_id: xTx.BankTransactionID,
          source: 'xero',
          is_transfer: txType === 'SPEND-TRANSFER' || txType === 'RECEIVE-TRANSFER',
          forced_is_transfer: forcedIsTransfer,
          category_hint: ruleCategory ?? categoryHint,
          raw_description: rawDescription,
          needs_review: needsReview,
          gl_account: glAccountName,
          gl_tax_type: glTaxType,
          matched_rule: xeroMatchedRule,
        })
      } catch (txErr) {
        errors.push(`Transaction error: ${txErr instanceof Error ? txErr.message : String(txErr)}`)
      }
    }

    // ----------------------------------------------------------------
    // Phase 3: Categorise and upsert.
    // ----------------------------------------------------------------
    const { toUpsert, transfersSkipped } = await processBatch(raws)

    // Deduplicate before upsert — Xero can return the same transaction twice in
    // a full sync (e.g. amended transactions). Prefer external_id as key when
    // present; fall back to the composite key for rows without one.
    const deduped = Array.from(
      toUpsert
        .reduce((map, tx) => {
          const key = tx.external_id
            ? `ext:${tx.external_id}`
            : `composite:${tx.account_id}|${tx.date}|${tx.amount}|${tx.description}`
          map.set(key, tx)
          return map
        }, new Map<string, (typeof toUpsert)[0]>())
        .values()
    )

    const { inserted, backfilled } = await upsertTransactions(deduped)

    // ----------------------------------------------------------------
    // Phase 3b: Store per-account Xero counts (full sync only).
    // raws excludes RECEIVE-TRANSFER, matching exactly what is stored in
    // Hearth. Stored here so the reconcile page can compare without making
    // live Xero API calls on every page load.
    // ----------------------------------------------------------------
    if (isFull) {
      const xeroCounts = new Map<string, number>()
      for (const raw of raws) {
        xeroCounts.set(raw.account_id, (xeroCounts.get(raw.account_id) ?? 0) + 1)
      }
      await Promise.all(
        Array.from(xeroCounts.entries()).map(([accountId, count]) =>
          supabase
            .from('accounts')
            .update({
              last_xero_sync_count: count,
              last_xero_synced_at: new Date().toISOString(),
            })
            .eq('id', accountId)
            .eq('household_id', DEFAULT_HOUSEHOLD_ID)
        )
      )
    }

    // ----------------------------------------------------------------
    // Phase 4: Link transfer pairs and salary pairs.
    // ----------------------------------------------------------------
    const batchDates = Array.from(new Set(raws.map(r => r.date)))
    await Promise.all([
      linkTransferPairs(batchDates),
      linkSalaryPairs(batchDates),
    ])

    // Update last_synced_at
    await supabase
      .from('xero_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)

    return NextResponse.json({
      synced: inserted,
      skipped: transfersSkipped,
      backfilled,
      errors,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
