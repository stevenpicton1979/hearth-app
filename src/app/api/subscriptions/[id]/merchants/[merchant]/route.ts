import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// ---------------------------------------------------------------------------
// DELETE /api/subscriptions/:id/merchants/:merchant
// Remove a merchant alias from a subscription.
// Returns 400 if removing would leave the subscription with zero merchants
// (use DELETE /api/subscriptions/:id to dismiss the whole subscription).
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; merchant: string } }
) {
  const supabase = createServerClient()

  const merchant = decodeURIComponent(params.merchant)

  // Check merchant count before removing
  const { count, error: countErr } = await supabase
    .from('subscription_merchants')
    .select('*', { count: 'exact', head: true })
    .eq('subscription_id', params.id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)

  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })

  if ((count ?? 0) <= 1) {
    return NextResponse.json(
      { error: 'cannot remove the last merchant — delete the subscription instead' },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('subscription_merchants')
    .delete()
    .eq('subscription_id', params.id)
    .eq('merchant', merchant)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
