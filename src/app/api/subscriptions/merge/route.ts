import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// ---------------------------------------------------------------------------
// POST /api/subscriptions/merge
// Merge two subscriptions: reassign all source merchants to target, then
// delete the source subscription.
//
// Body: { source_id: string, target_id: string }
//
// Metadata resolution:
//   - TARGET's metadata stays as-is (name, url, email, category, etc.)
//   - Source's notes are appended to target's notes with a prefix
//   - All other source metadata is discarded
//
// Idempotency: if source no longer exists, returns 404.
// Duplicate merchants: if target already has a source merchant, skip silently.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { source_id, target_id } = body as { source_id?: string; target_id?: string }

  if (!source_id || !target_id) {
    return NextResponse.json({ error: 'source_id and target_id are required' }, { status: 400 })
  }
  if (source_id === target_id) {
    return NextResponse.json({ error: 'source and target must be different subscriptions' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Fetch source
  const { data: source } = await supabase
    .from('subscriptions')
    .select('id, name, notes')
    .eq('id', source_id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .maybeSingle()

  if (!source) return NextResponse.json({ error: 'source subscription not found' }, { status: 404 })

  // Fetch target
  const { data: target } = await supabase
    .from('subscriptions')
    .select('id, notes')
    .eq('id', target_id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .maybeSingle()

  if (!target) return NextResponse.json({ error: 'target subscription not found' }, { status: 404 })

  // Get source merchants
  const { data: sourceLinks } = await supabase
    .from('subscription_merchants')
    .select('merchant')
    .eq('subscription_id', source_id)

  // Get target merchants (to dedupe)
  const { data: targetLinks } = await supabase
    .from('subscription_merchants')
    .select('merchant')
    .eq('subscription_id', target_id)

  const targetMerchantSet = new Set((targetLinks ?? []).map(l => l.merchant))

  // Delete all source merchant links
  await supabase
    .from('subscription_merchants')
    .delete()
    .eq('subscription_id', source_id)

  // Re-insert source merchants under target (skipping any already on target)
  const newLinks = (sourceLinks ?? [])
    .filter(l => !targetMerchantSet.has(l.merchant))
    .map(l => ({ subscription_id: target_id, merchant: l.merchant, household_id: DEFAULT_HOUSEHOLD_ID }))

  if (newLinks.length > 0) {
    await supabase.from('subscription_merchants').insert(newLinks)
  }

  // Append source notes to target notes
  const sourcePart = source.notes ? `Merged from ${source.name}: ${source.notes}` : null
  const newNotes = target.notes && sourcePart
    ? `${target.notes}\n\n${sourcePart}`
    : target.notes ?? sourcePart

  if (newNotes !== target.notes) {
    await supabase
      .from('subscriptions')
      .update({ notes: newNotes, updated_at: new Date().toISOString() })
      .eq('id', target_id)
  }

  // Delete source (subscription_merchants rows already removed above)
  await supabase
    .from('subscriptions')
    .delete()
    .eq('id', source_id)

  return NextResponse.json({ ok: true })
}
