import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('training_labels')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .order('status', { ascending: true }) // pending first
    .order('holdout', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch transaction stats for each merchant
  const merchants = (data || []).map(r => r.merchant)
  const statsByMerchant: Record<string, { count: number; totalSpend: number; minDate: string; maxDate: string }> = {}

  if (merchants.length > 0) {
    const { data: txns } = await supabase
      .from('transactions')
      .select('merchant, amount, date')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .in('merchant', merchants)

    for (const t of txns || []) {
      const m = t.merchant
      if (!statsByMerchant[m]) statsByMerchant[m] = { count: 0, totalSpend: 0, minDate: t.date, maxDate: t.date }
      statsByMerchant[m].count++
      statsByMerchant[m].totalSpend += Math.abs(t.amount)
      if (t.date < statsByMerchant[m].minDate) statsByMerchant[m].minDate = t.date
      if (t.date > statsByMerchant[m].maxDate) statsByMerchant[m].maxDate = t.date
    }
  }

  const labels = (data || []).map(r => ({
    ...r,
    transaction_count: statsByMerchant[r.merchant]?.count ?? 0,
    total_spend: statsByMerchant[r.merchant]?.totalSpend ?? 0,
    min_date: statsByMerchant[r.merchant]?.minDate ?? null,
    max_date: statsByMerchant[r.merchant]?.maxDate ?? null,
  }))

  return NextResponse.json({ labels })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { merchant, ...updates } = body
  if (!merchant) return NextResponse.json({ error: 'merchant required' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('training_labels')
    .update({ ...updates, labelled_at: new Date().toISOString() })
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('merchant', merchant)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ label: data })
}
