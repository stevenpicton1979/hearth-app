import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

interface ExampleTransaction {
  raw_description: string | null
  date: string
  amount: number
  description: string | null
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
    .limit(20)
    .order('date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return up to 3 distinct transactions with full details
  const seen = new Set<string>()
  const examples: ExampleTransaction[] = []
  for (const row of data || []) {
    const text = (row.raw_description || row.description || '').trim(