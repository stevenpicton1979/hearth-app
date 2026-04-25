import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// DELETE /api/transactions/[id]/review — clears the needs_review flag (dismiss)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { error } = await supabase
    .from('transactions')
    .update({ needs_review: false })
    .eq('id', params.id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
