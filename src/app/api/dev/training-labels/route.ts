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

  // Fetch transaction stats — keyed by UPPERCASE merchant so the join is
  // case-insensitive. This prevents drift between training_labels.merchant
  // and transactions.merchant caused by Xero re-syncs, cleanMerchant changes,
  // or labels created before certain pipeline normalisations were in place.
  type MerchantStats = {
    count: number
    totalSpend: number
    minDate: string
    maxDate: string
    accountIds: Set<string>
    categoryCounts: Record<string, number>
    glAccountCounts: Record<string, number>
    suggestedClassification?: string | null
  }
  const statsByMerchantUpper = new Map<string, MerchantStats>()

  {
    const { data: txns } = await supabase
      .from('transactions')
      .select('merchant, amount, date, account_id, category, gl_account')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)

    for (const t of txns || []) {
      const key = (t.merchant ?? '').toUpperCase()
      if (!key) continue
      if (!statsByMerchantUpper.has(key)) {
        statsByMerchantUpper.set(key, {
          count: 0, totalSpend: 0, minDate: t.date, maxDate: t.date,
          accountIds: new Set(), categoryCounts: {}, glAccountCounts: {},
        })
      }
      const s = statsByMerchantUpper.get(key)!
      s.count++
      s.totalSpend += Math.abs(t.amount)
      if (t.date < s.minDate) s.minDate = t.date
      if (t.date > s.maxDate) s.maxDate = t.date
      if (t.account_id) s.accountIds.add(t.account_id)
      if (t.category) s.categoryCounts[t.category] = (s.categoryCounts[t.category] ?? 0) + 1
      if (t.gl_account) s.glAccountCounts[t.gl_account] = (s.glAccountCounts[t.gl_account] ?? 0) + 1
    }

    // Fetch display_name and owner for all referenced accounts in one query
    const allAccountIds = Array.from(new Set(
      Array.from(statsByMerchantUpper.values()).flatMap(s => Array.from(s.accountIds))
    ))
    const accountNameMap = new Map<string, string>()   // id → display_name
    const accountOwnerById = new Map<string, string>() // id → owner

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

    // Compute suggested_classification per merchant BEFORE converting IDs to names.
    // If every account this merchant appears in shares one owner → suggest it.
    // Ambiguous (multiple owners) → null.
    for (const stats of statsByMerchantUpper.values()) {
      const owners = new Set(
        Array.from(stats.accountIds)
          .map(id => accountOwnerById.get(id))
          .filter((o): o is string => o != null)
      )
      stats.suggestedClassification = owners.size === 1 ? Array.from(owners)[0] : null

      // Convert account UUIDs → display names
      stats.accountIds = new Set(Array.from(stats.accountIds).map(id => accountNameMap.get(id) ?? id))
    }
  }

  const labels = (data || []).map(r => {
    // Look up by uppercase key — tolerates case drift between training_labels and transactions
    const stats = statsByMerchantUpper.get((r.merchant ?? '').toUpperCase())
    return {
      ...r,
      transaction_count: stats?.count ?? 0,
      total_spend: stats?.totalSpend ?? 0,
      min_date: stats?.minDate ?? null,
      max_date: stats?.maxDate ?? null,
      accounts: Array.from(stats?.accountIds ?? []),
      suggested_classification: stats?.suggestedClassification ?? null,
      dominant_category: (() => {
        const cats = stats?.categoryCounts ?? {}
        const entries = Object.entries(cats)
        if (entries.length === 0) return null
        return entries.sort((a, b) => b[1] - a[1])[0][0]
      })(),
      gl_category: (() => {
        const gls = stats?.glAccountCounts ?? {}
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
