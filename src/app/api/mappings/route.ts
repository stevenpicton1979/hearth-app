import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export async function PUT(req: NextRequest) {
  const { merchant, category, classification, notes } = await req.json()
  const supabase = createServerClient()
  const { error } = await supabase
    .from('merchant_mappings')
    .update({ category, classification, notes, updated_at: new Date().toISOString() })
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('merchant', merchant)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Apply to all transactions
  const updates: Record<string, string | null> = {}
  if (category !== undefined) updates.category = category
  if (classification !== undefined) updates.classification = classification
  if (Object.keys(updates).length) {
    await supabase
      .from('transactions')
      .update(updates)
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('merchant', merchant)
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const merchant = searchParams.get('merchant')
  if (!merchant) return NextResponse.json({ error: 'merchant required' }, { status: 400 })
  const supabase = createServerClient()
  const { error } = await supabase
    .from('merchant_mappings')
    .delete()
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('merchant', merchant)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST() {
  // Apply all rules to all transactions
  const supabase = createServerClient()
  const { data: mappings } = await supabase
    .from('merchant_mappings')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
  if (!mappings?.length) return NextResponse.json({ ok: true, applied: 0 })

  let applied = 0
  for (const m of mappings) {
    const updates: Record<string, string | null> = {}
    if (m.category) updates.category = m.category
    if (m.classification) updates.classification = m.classification
    if (Object.keys(updates).length) {
      await supabase
        .from('transactions')
        .update(updates)
        .eq('household_id', DEFAULT_HOUSEHOLD_ID)
        .eq('merchant', m.merchant)
      applied++
    }
  }
  return NextResponse.json({ ok: true, applied })
}
