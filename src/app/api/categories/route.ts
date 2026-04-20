import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// Table: category_prefs(id, household_id, category, is_hidden, display_name, updated_at)
// unique(household_id, category)
// See migration: supabase/migrations/003_category_prefs.sql

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('category_prefs')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .order('category')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prefs: data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { category, is_hidden, display_name } = body
  if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 })
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('category_prefs')
    .upsert(
      {
        household_id: DEFAULT_HOUSEHOLD_ID,
        category,
        is_hidden: is_hidden ?? false,
        display_name: display_name ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'household_id,category' }
    )
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pref: data })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 })
  const supabase = createServerClient()
  const { error } = await supabase
    .from('category_prefs')
    .delete()
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('category', category)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
