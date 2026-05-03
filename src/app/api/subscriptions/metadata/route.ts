import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// ---------------------------------------------------------------------------
// GET /api/subscriptions/metadata?merchant=X
// Returns saved metadata for a confirmed merchant.
// Returns 404 when no metadata row exists yet.
//
// PUT /api/subscriptions/metadata
// Upserts metadata. Validates that the merchant has classification='Subscription'
// in merchant_mappings first; rejects with 400 if not.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const merchant = req.nextUrl.searchParams.get('merchant')
  if (!merchant) return NextResponse.json({ error: 'merchant required' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('subscription_metadata')
    .select('*')
    .eq('merchant', merchant)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { merchant, cancellation_url, account_email, notes, auto_renews, next_renewal_override, category } = body as {
    merchant?: string
    cancellation_url?: string | null
    account_email?: string | null
    notes?: string | null
    auto_renews?: boolean
    next_renewal_override?: string | null
    category?: string | null
  }

  if (!merchant || typeof merchant !== 'string') {
    return NextResponse.json({ error: 'merchant required' }, { status: 400 })
  }
  if (auto_renews !== undefined && typeof auto_renews !== 'boolean') {
    return NextResponse.json({ error: 'auto_renews must be a boolean' }, { status: 400 })
  }
  if (next_renewal_override !== undefined && next_renewal_override !== null) {
    if (isNaN(Date.parse(next_renewal_override as string))) {
      return NextResponse.json({ error: 'next_renewal_override must be a valid date' }, { status: 400 })
    }
  }

  const supabase = createServerClient()

  // Verify the merchant is confirmed as a subscription
  const { data: mapping } = await supabase
    .from('merchant_mappings')
    .select('classification')
    .eq('merchant', merchant)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .maybeSingle()

  if (!mapping) {
    return NextResponse.json({ error: 'merchant has no merchant_mappings row' }, { status: 400 })
  }
  if (mapping.classification !== 'Subscription') {
    return NextResponse.json({ error: 'merchant is not classified as a Subscription' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data: existing } = await supabase
    .from('subscription_metadata')
    .select('created_at')
    .eq('merchant', merchant)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .maybeSingle()

  const row = {
    merchant,
    household_id: DEFAULT_HOUSEHOLD_ID,
    cancellation_url: cancellation_url ?? null,
    account_email: account_email ?? null,
    notes: notes ?? null,
    auto_renews: auto_renews ?? true,
    next_renewal_override: next_renewal_override ?? null,
    category: category ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  }

  const { data: upserted, error } = await supabase
    .from('subscription_metadata')
    .upsert(row, { onConflict: 'merchant,household_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(upserted)
}
