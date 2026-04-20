import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { category, classification, notes } = await req.json()
  const supabase = createServerClient()

  // Get the transaction to find its merchant
  const { data: txn } = await supabase
    .from('transactions')
    .select('merchant')
    .eq('id', params.id)
    .single()
  if (!txn) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Upsert merchant mapping
  if (category !== undefined || classification !== undefined) {
    await supabase.from('merchant_mappings').upsert(
      {
        household_id: DEFAULT_HOUSEHOLD_ID,
        merchant: txn.merchant,
        ...(category !== undefined && { category }),
        ...(classification !== undefined && { classification }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'household_id,merchant' }
    )

    // Apply to all transactions from this merchant
    const updates: Record<string, string | null> = {}
    if (category !== undefined) updates.category = category
    if (classification !== undefined) updates.classification = classification
    await supabase
      .from('transactions')
      .update(updates)
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('merchant', txn.merchant)
  }

  // Notes only applies to this transaction
  if (notes !== undefined) {
    await supabase.from('transactions').update({ notes }).eq('id', params.id)
  }

  return NextResponse.json({ ok: true })
}
