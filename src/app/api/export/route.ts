import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const account = searchParams.get('account')

  const supabase = createServerClient()
  let query = supabase
    .from('transactions')
    .select('date, merchant, description, amount, category, classification, notes, accounts(display_name)')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_transfer', false)
    .order('date', { ascending: false })

  if (from) query = query.gte('date', from)
  if (to) query = query.lte('date', to)
  if (account) query = query.eq('account_id', account)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const header = 'Date,Merchant,Description,Account,Amount,Category,Classification,Notes'
  const rows = (data || []).map((t) =>
    [
      t.date,
      `"${(t.merchant || '').replace(/"/g, '""')}"`,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      `"${(t.accounts?.[0]?.display_name || '').replace(/"/g, '""')}"`,
      t.amount,
      t.category || '',
      t.classification || '',
      `"${(t.notes || '').replace(/"/g, '""')}"`,
    ].join(',')
  )

  const csv = [header, ...rows].join('\n')
  const month = from ? from.slice(0, 7) : new Date().toISOString().slice(0, 7)

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="hearth-transactions-${month}.csv"`,
    },
  })
}
