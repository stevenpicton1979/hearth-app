import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { computeMonthsSince } from '@/lib/subscriptionUtils'

// ---------------------------------------------------------------------------
// GET /api/subscriptions
// Returns all subscriptions (active + cancelled) with merchant aliases, plus
// computed fields: lifetime_spend, months_since_cancelled.
// Detection data (possibly_cancelled, last_charged, etc.) is computed
// server-side in page.tsx from transaction history.
//
// POST /api/subscriptions
// Create a new subscription from a detected candidate.
// Body: { name: string, initial_merchant: string,
//         is_active?: boolean, cancelled_at?: string }
// Default is_active = true. If is_active = false, cancelled_at is required.
// ---------------------------------------------------------------------------

export async function GET() {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, subscription_merchants(merchant)')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const subscriptions = (data ?? []).map(s => ({
    ...s,
    merchants: ((s.subscription_merchants ?? []) as { merchant: string }[]).map(m => m.merchant),
    subscription_merchants: undefined,
  }))

  // Gather all merchants across all subscriptions to compute lifetime_spend
  const allMerchants = Array.from(new Set(subscriptions.flatMap(s => s.merchants)))

  const merchantSpend: Record<string, number> = {}
  if (allMerchants.length > 0) {
    const { data: txRows } = await supabase
      .from('transactions')
      .select('merchant, amount')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('is_transfer', false)
      .lt('amount', 0)
      .in('merchant', allMerchants)

    for (const tx of txRows ?? []) {
      const m = tx.merchant as string
      merchantSpend[m] = (merchantSpend[m] ?? 0) + Math.abs(tx.amount as number)
    }
  }

  const enriched = subscriptions.map(s => ({
    ...s,
    lifetime_spend: s.merchants.reduce((sum: number, m: string) => sum + (merchantSpend[m] ?? 0), 0),
    months_since_cancelled: s.cancelled_at ? computeMonthsSince(s.cancelled_at as string) : null,
  }))

  return NextResponse.json({ subscriptions: enriched })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const {
    name,
    initial_merchant,
    is_active: isActiveInput,
    cancelled_at: cancelledAtInput,
  } = body as {
    name?: string
    initial_merchant?: string
    is_active?: boolean
    cancelled_at?: string
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!initial_merchant || typeof initial_merchant !== 'string') {
    return NextResponse.json({ error: 'initial_merchant is required' }, { status: 400 })
  }

  const isActive = isActiveInput ?? true
  const today = new Date().toISOString().slice(0, 10)

  // Cancelled subscriptions must supply a cancelled_at date
  if (!isActive && !cancelledAtInput) {
    return NextResponse.json(
      { error: 'cancelled_at is required when is_active is false' },
      { status: 400 }
    )
  }

  if (cancelledAtInput) {
    if (isNaN(Date.parse(cancelledAtInput))) {
      return NextResponse.json({ error: 'cancelled_at must be a valid date' }, { status: 400 })
    }
    if (cancelledAtInput > today) {
      return NextResponse.json({ error: 'cancelled_at cannot be in the future' }, { status: 400 })
    }
  }

  const supabase = createServerClient()
  const now = new Date().toISOString()

  // Check that the merchant isn't already linked to a subscription
  const { data: existingLink } = await supabase
    .from('subscription_merchants')
    .select('subscription_id')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('merchant', initial_merchant)
    .maybeSingle()

  if (existingLink) {
    return NextResponse.json({ error: 'merchant already linked to a subscription' }, { status: 409 })
  }

  // Create the subscription
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .insert({
      household_id: DEFAULT_HOUSEHOLD_ID,
      name: name.trim(),
      auto_renews: true,
      is_active: isActive,
      cancelled_at: cancelledAtInput ?? null,
      auto_cancelled: false,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })

  // Link the initial merchant
  const { error: linkErr } = await supabase
    .from('subscription_merchants')
    .insert({ subscription_id: sub.id, merchant: initial_merchant, household_id: DEFAULT_HOUSEHOLD_ID })

  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 })

  // Mark the merchant as a subscription in merchant_mappings
  await supabase
    .from('merchant_mappings')
    .upsert(
      { merchant: initial_merchant, household_id: DEFAULT_HOUSEHOLD_ID, classification: 'Subscription', source: 'manual', updated_at: now },
      { onConflict: 'household_id,merchant' }
    )

  return NextResponse.json({ subscription: { ...sub, merchants: [initial_merchant] } }, { status: 201 })
}
