import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { parseCSV, extractBalance, extractNABAccountName, extractAmexAccountName } from '@/lib/csvParser'
import { processBatch, upsertTransactions } from '@/lib/categoryPipeline'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]
    const accountName = formData.get('account_name') as string
    let accountId = formData.get('account_id') as string

    if (!files.length) return NextResponse.json({ error: 'No files provided' }, { status: 400 })

    const supabase = createServerClient()

    // Read all file texts upfront (needed for NAB detection and parsing)
    const fileTexts = await Promise.all(files.map(f => f.text()))

    // Auto-detect NAB or Amex account from file content when no account provided
    if (!accountId) {
      for (const text of fileTexts) {
        const nabName = extractNABAccountName(text)
        const amexName = extractAmexAccountName(text)
        const autoName = nabName || amexName
        if (autoName) {
          const institution = nabName ? 'NAB' : 'Amex'
          const { data: existing } = await supabase
            .from('accounts')
            .select('id')
            .eq('household_id', DEFAULT_HOUSEHOLD_ID)
            .eq('display_name', autoName)
            .maybeSingle()
          if (existing) {
            accountId = existing.id
          } else {
            const { data, error } = await supabase
              .from('accounts')
              .insert({
                household_id: DEFAULT_HOUSEHOLD_ID,
                display_name: autoName,
                account_type: 'credit_card',
                institution,
              })
              .select('id')
              .single()
            if (error) return NextResponse.json({ error: error.message }, { status: 500 })
            accountId = data.id
          }
          break
        }
      }
    }

    // Create CBA/other account if needed
    if (!accountId && accountName) {
      const { data, error } = await supabase
        .from('accounts')
        .insert({ household_id: DEFAULT_HOUSEHOLD_ID, display_name: accountName, account_type: 'transaction' })
        .select('id')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      accountId = data.id
    }
    if (!accountId) return NextResponse.json({ error: 'Account required' }, { status: 400 })

    let totalTransfers = 0
    const allParsed: ReturnType<typeof parseCSV> = []
    let latestBalance: number | undefined

    for (const text of fileTexts) {
      const parsed = parseCSV(text)
      allParsed.push(...parsed)
      // Count rows that failed to parse (invalid date/amount) — transfers are now in parsed
      totalTransfers += Math.max(0, text.split('\n').filter(l => l.trim()).length - 1 - parsed.length)
      // Extract balance directly from raw CSV (independent of transfer filtering)
      const bal = extractBalance(text)
      if (bal !== undefined) latestBalance = bal
    }

    const raws = allParsed.map(p => ({
      account_id: accountId,
      date: p.date,
      amount: p.amount,
      description: p.description,
      is_transfer: p.is_transfer,
      category_hint: p.category,
      raw_description: p.description,
    }))

    const { toUpsert, transfersSkipped } = await processBatch(raws)

    // Deduplicate by conflict key before upsert — CSV files can contain
    // duplicate rows that would trigger "ON CONFLICT DO UPDATE command
    // cannot affect row a second time". Keep last occurrence (latest in file).
    const deduped = Array.from(
      toUpsert
        .reduce((map, tx) => {
          map.set(`${tx.account_id}|${tx.date}|${tx.amount}|${tx.description}`, tx)
          return map
        }, new Map<string, (typeof toUpsert)[0]>())
        .values()
    )

    const { inserted, duplicates, autoCategorised } = await upsertTransactions(deduped)

    // Update account current_balance from the raw CSV balance (most recent row)
    if (latestBalance !== undefined) {
      await supabase
        .from('accounts')
        .update({ current_balance: latestBalance, last_synced_at: new Date().toISOString() })
        .eq('id', accountId)
    }

    return NextResponse.json({
      imported: inserted,
      duplicates,
      transfers_skipped: transfersSkipped + totalTransfers,
      auto_categorised: autoCategorised,
      errors: [],
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
