import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// Table: goals(id, household_id, name, target_amount, current_amount, target_date, is_complete, emoji, created_at, updated_at)
// Note: linked_account_id column added via migration 003_category_prefs.sql:
//   alter table goals add column if not exists linked_account_id uuid references accounts(id);

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ goals: data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, target_amount, current_amount, target_date, emoji, linked_account_id } = body
  if (!name || target_amount === undefined) {
    return NextResponse.json({ error: 'name and target_amount required' }, { status: 400 })
  }
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('goals')
    .insert({
      household_id: DEFAULT_HOUSEHOLD_ID,
      name,
      target_amount,
      current_amount: current_amount ?? 0,
      target_date: target_date || null,
      emoji: emoji || null,
      linked_account_id: linked_account_id || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ goal: data })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  updates.updated_at = new Date().toISOString()
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('goals')
    .update(updates)
    .eq('id', id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ goal: data })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createServerClient()
  const { error } = await supabase
    .from('goals')
    .delete()
    .eq('id', id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
