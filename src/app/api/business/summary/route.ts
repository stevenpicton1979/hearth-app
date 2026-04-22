import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

function getMonthBounds(month: string): { start: string; end: string } {
  const [year, mon] = month.split('-').map(Number)
  const lastDay = new Date(year, mon, 0).getDate()
  const start = `${year}-${String(mon).padStart(2, '0')}-01`
  const end = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month') ||
    new Date().toISOString().slice(0, 7)

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM.' }, { status: 400 })
  }

  const { start, end } = getMonthBounds(month)
  const supabase = createServerClient()

  const { data: bizAccounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('scope', 'business')

  const bizIds = bizAccounts?.map(a => a.id) ?? []

  if (bizIds.length === 0) {
    return NextResponse.json({
      revenue: 0,
      expenses: 0,
      netProfit: 0,
      byCategory: [],
      topMerchants: [],
      recentTransactions: [],
    })
  }

  const txQ = supabase
    .from('transactions')
    .select('id, date, amount, description, category')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_transfer', false)
    .gte('date', start)
    .lte('date', end)
    .in('account_id', bizIds)
    .order('date', { ascending: false })

  const { data: txns, error } = await txQ

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const transactions = txns ?? []

  const revenue = transactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0)

  const expenses = transactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const netProfit = revenue - expenses

  const byCategoryMap = new Map<string, number>()
  for (const t of transactions.filter(t => t.amount < 0)) {
    const cat = t.category || 'Uncategorized'
    byCategoryMap.set(cat, (byCategoryMap.get(cat) ?? 0) + Math.abs(t.amount))
  }
  const byCategory = Array.from(byCategoryMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)

  const merchantMap = new Map<string, number>()
  for (const t of transactions.filter(t => t.amount < 0)) {
    const m = t.description || 'Unknown'
    merchantMap.set(m, (merchantMap.get(m) ?? 0) + Math.abs(t.amount))
  }
  const topMerchants = Array.from(merchantMap.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)

  const recentTransactions = transactions.slice(0, 10)

  return NextResponse.json({
    revenue,
    expenses,
    netProfit,
    byCategory,
    topMerchants,
    recentTransactions,
  })
}
