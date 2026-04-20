import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('accounts')
    .select('id, display_name, institution, account_type, is_active, last_synced_at')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_active', true)
    .order('display_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ accounts: data })
}

export async function POST(req: Request) {
  const { display_name, institution, account_type } = await req.json()
  if (!display_name) return NextResponse.json({ error: 'display_name required' }, { status: 400 })
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('accounts')
    .insert({ household_id: DEFAULT_HOUSEHOLD_ID, display_name, institution: institution || null, account_type: account_type || 'transaction' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ account: data })
}
