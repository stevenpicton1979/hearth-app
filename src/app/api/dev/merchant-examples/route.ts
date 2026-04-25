import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export async function GET(req: NextRequest) {
  const merchant = req.nextUrl.searchParams.get('merchant')
  if (!merchant) return NextResponse.json({ error: 'merchant required' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('*, accounts!account_id(display_name)')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('merchant', merchant)
    .order('date', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return up to 5 distinct recent transactions, newest first, de-dup by raw key
  const seen = new Set<string>()
  const examples: Record<string, unknown>[] = []
  for (const rawRow of (data || []) as Record<string, unknown>[]) {
    const raw = ((rawRow.raw_description as string) || '').trim()
    const cleaned = ((rawRow.description as string) || '').trim()
    const key = raw || cleaned
    if (!key || seen.has(key)) continue
    seen.add(key)

    // Resolve account display name; strip internal/noisy columns
    const row: Record<string, unknown> = { ...rawRow }
    const accountJoin = row.accounts as { display_name?: string } | null
    row.account = accountJoin?.display_name ?? row.account_id
    delete row.account_id
    delete row.household_id
    delete row.accounts

    examples.push(row)
    if (examples.length >= 5) break
  }

  return NextResponse.json({ examples })
}
