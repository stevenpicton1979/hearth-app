import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// ---------------------------------------------------------------------------
// GET  /api/subscriptions/:id  — single subscription with merchant aliases
// PUT  /api/subscriptions/:id  — update metadata fields (name, cancellation_url, …)
// DELETE /api/subscriptions/:id — soft-delete (is_active=false) + detach merchants
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, subscription_merchants(merchant)')
    .eq('id', params.id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({
    ...data,
    merchants: ((data.subscription_merchants ?? []) as { merchant: string }[]).map(m => m.merchant),
    subscription_merchants: undefined,
  })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Verify subscription exists for this household
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('id', params.id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const {
    name, cancellation_url, account_email, notes,
    auto_renews, next_renewal_override, category,
  } = body as {
    name?: string
    cancellation_url?: string | null
    account_email?: string | null
    notes?: string | null
    auto_renews?: boolean
    next_renewal_override?: string | null
    category?: string | null
  }

  if (auto_renews !== undefined && typeof auto_renews !== 'boolean') {
    return NextResponse.json({ error: 'auto_renews must be a boolean' }, { status: 400 })
  }
  if (next_renewal_override !== undefined && next_renewal_override !== null) {
    if (isNaN(Date.parse(next_renewal_override))) {
      return NextResponse.json({ error: 'next_renewal_override must be a valid date' }, { status: 400 })
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name
  if (cancellation_url !== undefined) updates.cancellation_url = cancellation_url
  if (account_email !== undefined) updates.account_email = account_email
  if (notes !== undefined) updates.notes = notes
  if (auto_renews !== undefined) updates.auto_renews = auto_renews
  if (next_renewal_override !== undefined) updates.next_renewal_override = next_renewal_override
  if (category !== undefined) updates.category = category

  const { data: updated, error } = await supabase
    .from('subscriptions')
    .update(updates)
    .eq('id', params.id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()

  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('id', params.id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Detach all merchant links first so the merchants become available as candidates again
  await supabase
    .from('subscription_merchants')
    .delete()
    .eq('subscription_id', params.id)

  // Soft-delete the subscription
  const { error } = await supabase
    .from('subscriptions')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
