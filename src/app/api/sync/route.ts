import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { isBasiqConfigured, getTransactions } from '@/lib/basiq'
import { processBatch, upsertTransactions } from '@/lib/categoryPipeline'

export async function POST(req: NextRequest) {
  if (!isBasiqConfigured()) return NextResponse.json({ error: 'Basiq not configured' }, { status: 503 })

  try {
    const supabase = createServerClient()
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, basiq_account_id, display_name')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('is_active', true)
      .not('basiq_account_id', 'is', null)

    if (!accounts?.length) return NextResponse.json({ message: 'No Basiq accounts', imported: 0, duplicates: 0 })

    let totalImported = 0
    let totalDuplicates = 0

    const body = await req.json().catch(() => ({}))
    const basiqUserId = body.basiq_user_id || process.env.BASIQ_USER_ID

    if (!basiqUserId) return NextResponse.json({ error: 'basiq_user_id required' }, { status: 400 })

    const rawTxns = await getTransactions(basiqUserId, body.from_date)

    for (const account of accounts) {
      const accountTxns = (rawTxns as Record<string, unknown>[]).filter(
        (t) => t['account'] === account.basiq_account_id || t['accountId'] === account.basiq_account_id
      )
      const raws = accountTxns.map((t) => ({
        account_id: account.id,
        date: (t['postDate'] || t['transactionDate']) as string,
        amount: parseFloat(t['amount'] as string),
        description: (t['description'] || t['narration'] || '') as string,
        basiq_transaction_id: t['id'] as string,
      }))
      const { toUpsert } = await processBatch(raws)
      const { inserted, duplicates } = await upsertTransactions(toUpsert)
      totalImported += inserted
      totalDuplicates += duplicates

      await supabase.from('accounts').update({ last_synced_at: new Date().toISOString() }).eq('id', account.id)
    }

    return NextResponse.json({ imported: totalImported, duplicates: totalDuplicates })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
