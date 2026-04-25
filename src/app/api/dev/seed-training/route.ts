import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

function fnv32a(str: string): number {
  let hash = 2166136261
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 16777619) >>> 0
  }
  return hash
}

export async function POST() {
  const supabase = createServerClient()

  const { data: txns, error: txnErr } = await supabase
    .from('transactions')
    .select('merchant, amount, category, classification, is_transfer, date')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .order('date', { ascending: true })

  if (txnErr) return NextResponse.json({ error: txnErr.message }, { status: 500 })
  if (!txns?.length) return NextResponse.json({ inserted: 0, message: 'No transactions found' })

  type MerchantStats = {
    merchant: string; count: number; totalSpend: number
    categories: Record<string, number>; classifications: Record<string, number>
    allIncome: boolean; allTransfer: boolean; minDate: string; maxDate: string
  }

  const byMerchant = new Map<string, MerchantStats>()
  for (const t of txns) {
    const m = t.merchant || 'UNKNOWN'
    if (!byMerchant.has(m)) {
      byMerchant.set(m, {
        merchant: m, count: 0, totalSpend: 0, categories: {}, classifications: {},
        allIncome: true, allTransfer: true, minDate: t.date, maxDate: t.date,
      })
    }
    const s = byMerchant.get(m)!
    s.count++
    s.totalSpend += Math.abs(t.amount)
    if (t.category) s.categories[t.category] = (s.categories[t.category] || 0) + 1
    if (t.classification) s.classifications[t.classification] = (s.classifications[t.classification] || 0) + 1
    if (t.amount <= 0) s.allIncome = false
    if (!t.is_transfer) s.allTransfer = false
    if (t.date < s.minDate) s.minDate = t.date
    if (t.date > s.maxDate) s.maxDate = t.date
  }

  const merchants = Array.from(byMerchant.values())
  const sortedBySpend = [...merchants].sort((a, b) => b.totalSpend - a.totalSpend)
  const spendRankMap = new Map(sortedBySpend.map((m, i) => [m.merchant, i]))
  const maxCount = Math.max(...merchants.map(m => m.count))
  const maxSpendRank = merchants.length - 1

  const top100 = merchants.map(m => {
    const countScore = maxCount > 0 ? m.count / maxCount : 0
    const spendRankScore = maxSpendRank > 0 ? 1 - (spendRankMap.get(m.merchant)! / maxSpendRank) : 1
    return { ...m, score: countScore * 0.5 + spendRankScore * 0.5 }
  }).sort((a, b) => b.score - a.score).slice(0, 100)

  const { data: existing } = await supabase
    .from('training_labels')
    .select('merchant')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
  const existingSet = new Set((existing || []).map(e => e.merchant))

  const rows = top100.filter(m => !existingSet.has(m.merchant)).map(m => ({
    household_id: DEFAULT_HOUSEHOLD_ID,
    merchant: m.merchant,
    correct_category: Object.entries(m.categories).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    correct_classification: Object.entries(m.classifications).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    is_income: m.allIncome,
    is_transfer: m.allTransfer,
    is_subscription: false,
    status: 'pending',
    holdout: fnv32a(m.merchant) % 5 === 0,
    labelled_by: 'steve',
  }))

  // Delete orphaned labels — merchant no longer exists in transactions
  const activeMerchants = new Set(merchants.map(m => m.merchant))
  const orphans = Array.from(existingSet).filter(m => !activeMerchants.has(m))
  let pruned = 0
  if (orphans.length > 0) {
    const { error: pruneErr } = await supabase
      .from('training_labels')
      .delete()
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .in('merchant', orphans)
    if (!pruneErr) pruned = orphans.length
  }

  if (rows.length === 0) return NextResponse.json({ inserted: 0, skipped: existingSet.size, pruned })

  const { error: insertErr } = await supabase.from('training_labels').insert(rows)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({
    inserted: rows.length,
    holdout: rows.filter(r => r.holdout).length,
    skipped: existingSet.size,
    pruned,
  })
}
