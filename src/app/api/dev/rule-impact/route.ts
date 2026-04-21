import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { cleanMerchant } from '@/lib/cleanMerchant'

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get('keyword')
  if (!keyword) return NextResponse.json({ error: 'keyword required' }, { status: 400 })

  const supabase = createServerClient()
  const { data: txns, error } = await supabase
    .from('transactions')
    .select('merchant, amount, category')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const kw = keyword.toLowerCase()
  const matches = (txns || []).filter(t =>
    cleanMerchant(t.merchant).toLowerCase().includes(kw)
  )

  const merchantSet = new Set(matches.map(t => cleanMerchant(t.merchant)))
  const totalSpend = matches.reduce((sum, t) => sum + Math.abs(t.amount), 0)
  const currentCategories: Record<string, number> = {}
  for (const t of matches) {
    const cat = t.category ?? 'uncategorised'
    currentCategories[cat] = (currentCategories[cat] || 0) + 1
  }

  return NextResponse.json({
    keyword,
    matchCount: matches.length,
    totalSpend,
    merchants: Array.from(merchantSet),
    currentCategories,
  })
}
