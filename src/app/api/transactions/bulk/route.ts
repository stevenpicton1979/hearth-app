import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export async function POST(req: NextRequest) {
  const { ids, action, value } = await req.json()
  if (!ids?.length) return NextResponse.json({ error: 'No ids' }, { status: 400 })

  const supabase = createServerClient()
  let update: Record<string, string | boolean | null> = {}

  if (action === 'set_category') update = { category: value }
  else if (action === 'set_classification') update = { classification: value }
  else if (action === 'exclude') update = { is_transfer: true }
  else if (action === 'unexclude') update = { is_transfer: false }
  else return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const { error } = await supabase
    .from('transactions')
    .update(update)
    .in('id', ids)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, updated: ids.length })
}
