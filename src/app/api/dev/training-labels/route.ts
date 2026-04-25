import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { mapGlAccountNameToCategory } from '@/lib/xeroCategories'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('training_labels')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .order('status', { ascending: true }) // pending first
    .order('holdout', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // transaction_count and total_spend are stored columns — written by seed-training.
  // No JOIN needed for those. We still JOIN for rich metadata (accounts, categories,
  // GL account) which drives the auto-category display and suggested classification.
  type RichStats = {
    minDate: string
    maxDate: string
    accountIds: Set<string>
    categoryCounts: Record<string, number>
    glAccountCounts: Record<string, number>
    suggestedClassification?: string | null
  }
  const richByMerchant = new Map<string, RichStats>()

  const merchants = (data || []).map((r: { merchant: string }) => r.merchant)
  // Uppercase so the IN clause matches the always-uppercase transactions.merchant column
  const uppercaseMerchants = Array.from(new Set(merchants.map((m: string) => (m ?? '').toUpperCase()))).filter(Boolean)

  if (uppercaseMerchants.length > 0) {
    const { data: txns } = await supabase
      .from('transactions')
      .select('merchant, date, account_id, category, gl_account')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .in('merchant', uppercaseMerchants)

    for (const t of txns || []) {
      const key = (t.merchant ?? '').toUpperCase()
      if (!key) continue
      if (!richByMerchant.has(key)) {
        richByMerchant.set(key, {
          minDate: t.date, maxDate: t.date,
          accountIds: new Set(), categoryCounts: {}, glAccountCounts: {},
        })
      }
      const s = richByMerchant.get(key)!
      if (t.date < s.minDate) s.minDate = t.date
      if (t.date > s.maxDate) s.maxDate = t.date
      if (t.account_id) s.accountIds.add(t.account_id)
      if (t.category) s.categoryCounts[t.category] = (s.categoryCounts[t.category] ?? 0) + 1
      if (t.gl_account) s.glAccountCounts[t.gl_account] = (s.glAccountCounts[t.gl_account] ?? 0) + 1
    }

    // Resolve account UUIDs → display names + owners
    const allAccountIds = Array.from(new Set(
      Array.from(richByMerchant.values()).flatMap(s => Array.from(s.accountIds))
    ))
    const accountNameMap = new Map<string, string>()
    const accountOwnerById = new Map<string, string>()

    if (allAccountIds.length > 0) {
      const { data: accts } = await supabase
        .from('accounts')
        .select('id, display_name, owner')
        .in('id', allAccountIds)
      for (const a of (accts || [])) {
        accountNameMap.set(a.id, a.display_name)
        if (a.owner) accountOwnerById.set(a.id, a.owner)
      }
    }

    for (const stats of Array.from(richByMerchant.values())) {
      const owners = new Set(
        Array.from(stats.accountIds)
          .map(id => accountOwnerById.get(id))
          .filter((o): o is string => o != null)
      )
      stats.suggestedClassification = owners.size === 1 ? Array.from(owners)[0] : null
      stats.accountIds = new Set(Array.from(stats.accountIds).map(id => accountNameMap.get(id) ?? id))
    }
  }

  const labels = (data || []).map(r => {
    const rich = richByMerchant.get((r.merchant ?? '').toUpperCase())
    return {
      ...r,
      // Count + spend come from stored columns — reliable, no JOIN drift
      transaction_count: r.transaction_count ?? 0,
      total_spend: r.total_spend ?? 0,
      // Rich metadata from JOIN — best-effort, drives auto-category display
      min_date: rich?.minDate ?? null,
      max_date: rich?.maxDate ?? null,
      accounts: Array.from(rich?.accountIds ?? []),
      suggested_classification: rich?.suggestedClassification ?? null,
      dominant_category: (() => {
        const cats = rich?.categoryCounts ?? {}
        const entries = Object.entries(cats)
        if (entries.length === 0) return null
        return entries.sort((a, b) => b[1] - a[1])[0][0]
      })(),
      gl_category: (() => {
        const gls = rich?.glAccountCounts ?? {}
        const entries = Object.entries(gls)
        if (entries.length === 0) return null
        const dominantGl = entries.sort((a, b) => b[1] - a[1])[0][0]
        return mapGlAccountNameToCategory(dominantGl)
      })(),
    }
  })

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

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { confirms } = body as {
    confirms: { merchant: string; correct_category: string; correct_classification: string | null }[]
  }
  if (!Array.isArray(confirms) || confirms.length === 0) {
    return NextResponse.json({ error: 'confirms array required' }, { status: 400 })
  }

  const supabase = createServerClient()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('training_labels')
    .upsert(
      confirms.map(c => ({
        household_id: DEFAULT_HOUSEHOLD_ID,
        merchant: c.merchant,
        correct_category: c.correct_category,
        correct_classification: c.correct_classification,
        status: 'confirmed',
        labelled_at: now,
      })),
      { onConflict: 'household_id,merchant' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ confirmed: confirms.length })
}
