import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .order('category')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ budgets: data })
}

export async function POST(req: NextRequest) {
  const { category, monthly_limit } = await req.json()
  if (!category || !monthly_limit) return NextResponse.json({ error: 'category and monthly_limit required' }, { status: 400 })
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('budgets')
    .upsert(
      { household_id: DEFAULT_HOUSEHOLD_ID, category, monthly_limit },
      { onConflict: 'household_id,category' }
    )
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ budget: data })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 })
  const supabase = createServerClient()
  const { error } = await supabase.from('budgets').delete()
    .eq('household_id', DEFAULT_HOUSEHOLD_ID).eq('category', category)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
