import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export async function GET(req: NextRequest) {
  const merchant = req.nextUrl.searchParams.get('merchant')
  if (!merchant) return NextResponse.json({ error: 'merchant required' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('description, raw_description')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('merchant', merchant)
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return up to 3 distinct raw_description values (fall back to description)
  const seen = new Set<string>()
  const examples: string[] = []
  for (const row of data || []) {
    const text = (row.raw_description || row.description || '').trim()
    if (text && !seen.has(text)) {
      seen.add(text)
      examples.push(text)
      if (examples.length >= 3) break
    }
  }

  return NextResponse.json({ examples })
}
