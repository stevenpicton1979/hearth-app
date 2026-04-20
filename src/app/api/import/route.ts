import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { parseCSV, extractBalance } from '@/lib/csvParser'
import { processBatch, upsertTransactions } from '@/lib/categoryPipeline'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]
    const accountName = formData.get('account_name') as string
    let accountId = formData.get('account_id') as string

    if (!files.length) return NextResponse.json({ error: 'No files provided' }, { status: 400 })

    const supabase = createServerClient()

    // Create account if needed
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

    for (const file of files) {
      const text = await file.text()
      const parsed = parseCSV(text)
      allParsed.push(...parsed)
      totalTransfers += text.split('\n').filter(l => l.trim()).length - 1 - parsed.length
      // Extract balance directly from raw CSV (independent of transfer filtering)
      const bal = extractBalance(text)
      if (bal !== undefined) latestBalance = bal
    }

    const raws = allParsed.map(p => ({
      account_id: accountId,
      date: p.date,
      amount: p.amount,
      description: p.description,
    }))

    const { toUpsert, transfersSkipped } = await processBatch(raws)
    const autoCategorised = toUpsert.filter(t => t.category !== null).length
    const { inserted, duplicates } = await upsertTransactions(toUpsert)

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
