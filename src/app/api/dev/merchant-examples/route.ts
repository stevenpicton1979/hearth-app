import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export async function GET(req: NextRequest) {
  const merchant = req.nextUrl.searchParams.get('merchant')
  if (!merchant) return NextResponse.json({ error: 'merchant required' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('description')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('merchant', merchant)
    .not('description', 'is', null)
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Deduplicate and return up to 3 distinct descriptions
  const seen = new Set<string>()
  const examples: string[] = []
  for (const row of data || []) {
    if (row.description && !seen.has(row.description)) {
      seen.add(row.description)
      examples.push(row.description)
      if (examples.length >= 3) break
    }
  }

  return NextResponse.json({ examples })
}
