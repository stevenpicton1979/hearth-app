import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// ---------------------------------------------------------------------------
// POST /api/subscriptions/:id/restore
// Restore a soft-deleted subscription (is_active = true).
// Note: merchant links were removed on soft-delete, so merchants are NOT
// automatically re-attached. Use POST /api/subscriptions/:id/merchants to
// re-link merchants after restoring.
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
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
