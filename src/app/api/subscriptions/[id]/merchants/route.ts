import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// ---------------------------------------------------------------------------
// POST /api/subscriptions/:id/merchants
// Add a merchant alias to an existing subscription.
// Body: { merchant: string }
//
// Returns 409 if the merchant is already linked to another ACTIVE subscription.
// Returns 200 (no-op) if the merchant is already linked to THIS subscription.
// Returns 201 on success.
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { merchant } = body as { merchant?: string }
  if (!merchant || typeof merchant !== 'string') {
    return NextResponse.json({ error: 'merchant is required' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Verify the target subscription exists and belongs to this household
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('id', params.id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .maybeSingle()

  if (!sub) return NextResponse.json({ error: 'subscription not found' }, { status: 404 })

  // Check if this merchant is already linked anywhere for this household
  const { data: existingLink } = await supabase
    .from('subscription_merchants')
    .select('subscription_id')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('merchant', merchant)
    .maybeSingle()

  if (existingLink) {
    if (existingLink.subscription_id === params.id) {
      return NextResponse.json({ ok: true }) // idempotent
    }
    // Check if the other subscription is active
    const { data: otherSub } = await supabase
      .from('subscriptions')
      .select('is_active')
      .eq('id', existingLink.subscription_id)
      .maybeSingle()

    if (otherSub?.is_active) {
      return NextResponse.json(
        { error: 'merchant already linked to another active subscription' },
        { status: 409 }
      )
    }
    // Linked to an inactive (dismissed) subscription — shouldn't happen since we
    // remove links on dismiss, but treat it as a conflict to be safe
    return NextResponse.json({ error: 'merchant already linked' }, { status: 409 })
  }

  const { error } = await supabase
    .from('subscription_merchants')
    .insert({ subscription_id: params.id, merchant, household_id: DEFAULT_HOUSEHOLD_ID })

  if (error) {
    if (error.code === '23505') return NextResponse.json({ ok: true }) // race condition, already linked
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
