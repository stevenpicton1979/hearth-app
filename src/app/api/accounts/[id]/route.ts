import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { scope } = await req.json()
  if (!scope || !['household', 'business', 'investment'].includes(scope)) {
    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
  }
  const supabase = createServerClient()
  const { error } = await supabase
    .from('accounts')
    .update({ scope })
    .eq('id', params.id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
