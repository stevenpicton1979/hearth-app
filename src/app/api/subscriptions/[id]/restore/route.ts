import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// ---------------------------------------------------------------------------
// POST /api/subscriptions/:id/restore
// Restore a cancelled subscription: is_active = true, cancelled_at = null,
// auto_cancelled = false. Merchant aliases are kept (they were preserved on
// cancel), so the subscription is immediately active with its aliases intact.
// Idempotent: restoring an already-active subscription is a no-op.
// ---------------------------------------------------------------------------

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient()

  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id, is_active')
    .eq('id', params.id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { error } = await supabase
    .from('subscriptions')
    .update({
      is_active: true,
      cancelled_at: null,
      auto_cancelled: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
