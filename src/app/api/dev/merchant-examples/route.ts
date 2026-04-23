import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export interface ExampleTransaction {
  raw: string
  date: string
  amount: number
  cleaned: string
}

export async function GET(req: NextRequest) {
  const merchant = req.nextUrl.searchParams.get('merchant')
  if (!merchant) return NextResponse.json({ error: 'merchant required' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('description, raw_description, date, amount')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('merchant', merchant)
    .order('date', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return up to 5 distinct recent transactions, newest first
  const seen = new Set<string>()
  const examples: ExampleTransaction[] = []
  for (const row of data || []) {
    const raw = (row.raw_description || '').trim()
    const cleaned = (row.description || '').trim()
    const key = raw || cleaned
    if (!key || seen.has(key)) continue
    seen.add(key)
    examples.push({ raw: raw || cleaned, date: row.date, amount: row.amount, cleaned })
    if (examples.length >= 5) break
  }

  return NextResponse.json({ examples })
}
