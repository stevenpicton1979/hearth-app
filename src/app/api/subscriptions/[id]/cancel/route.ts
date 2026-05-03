import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// ---------------------------------------------------------------------------
// POST /api/subscriptions/:id/cancel
//
// Body: { cancelled_at?: string (ISO date), auto_cancelled?: boolean }
//
// Sets is_active = false and records when the subscription ended.
// Idempotent: if already cancelled, cancelled_at is NOT overwritten.
// Merchant aliases are kept so lifetime_spend remains computable.
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: Record<string, unknown> = {}
  try {
    const text = await req.text()
    if (text) body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { cancelled_at: cancelledAtInput, auto_cancelled } = body as {
    cancelled_at?: string
    auto_cancelled?: boolean
  }

  const today = new Date().toISOString().slice(0, 10)
  const cancelledAt = cancelledAtInput ?? today

  if (isNaN(Date.parse(cancelledAt))) {
    return NextResponse.json({ error: 'cancelled_at must be a valid date' }, { status: 400 })
  }
  if (cancelledAt > today) {
    return NextResponse.json({ error: 'cancelled_at cannot be in the future' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id, cancelled_at')
    .eq('id', params.id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const updates: Record<string, unknown> = {
    is_active: false,
    updated_at: new Date().toISOString(),
  }

  // Idempotent: once cancelled_at is set, it stays unchanged
  if (!existing.cancelled_at) {
    updates.cancelled_at = cancelledAt
  }
  if (auto_cancelled !== undefined) {
    updates.auto_cancelled = auto_cancelled
  }

  const { data: updated, error } = await supabase
    .from('subscriptions')
    .update(updates)
    .eq('id', params.id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ subscription: updated })
}
