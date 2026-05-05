import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { cleanMerchant } from '@/lib/cleanMerchant'

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get('keyword')
  if (!keyword) return NextResponse.json({ error: 'keyword required' }, { status: 400 })

  const supabase = createServerClient()

  // Paginate — PostgREST enforces a 1000-row server cap regardless of .limit().
  const PAGE_SIZE = 1000
  const { data: txP0, error: txErr0 } = await supabase
    .from('transactions')
    .select('merchant, amount, category')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .range(0, PAGE_SIZE - 1)

  if (txErr0) return NextResponse.json({ error: txErr0.message }, { status: 500 })
  const txns = [...(txP0 ?? [])]
  let txLastFull = txns.length === PAGE_SIZE

  for (let from = PAGE_SIZE; txLastFull; from += PAGE_SIZE) {
    const { data: page, error } = await supabase
      .from('transactions')
      .select('merchant, amount, category')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .range(from, from + PAGE_SIZE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!page) break
    txns.push(...page)
    txLastFull = page.length === PAGE_SIZE
  }

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
