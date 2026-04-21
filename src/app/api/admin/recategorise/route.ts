import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { guessCategory } from '@/lib/autoCategory'

export async function POST() {
  const supabase = createServerClient()

  // Load all non-transfer expense transactions without a category
  const { data: txns, error } = await supabase
    .from('transactions')
    .select('id, merchant')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_transfer', false)
    .lt('amount', 0)
    .is('category', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!txns || txns.length === 0) return NextResponse.json({ updated: 0 })

  let updated = 0
  const mappingsToUpsert: { household_id: string; merchant: string; category: string; classification: null }[] = []

  const updates = txns
    .map(t => ({ id: t.id, merchant: t.merchant, category: guessCategory(t.merchant) }))
    .filter(t => t.category !== null)

  if (updates.length === 0) return NextResponse.json({ updated: 0 })

  // Update transactions in batches
  for (const { id, category } of updates) {
    await supabase.from('transactions').update({ category }).eq('id', id)
    updated++
  }

  // Persist new auto-categorised merchants as mappings
  for (const { merchant, category } of updates) {
    if (category) {
      mappingsToUpsert.push({ household_id: DEFAULT_HOUSEHOLD_ID, merchant, category, classification: null })
    }
  }

  if (mappingsToUpsert.length > 0) {
    await supabase
      .from('merchant_mappings')
      .upsert(mappingsToUpsert, { onConflict: 'household_id,merchant', ignoreDuplicates: true })
  }

  return NextResponse.json({ updated })
}
