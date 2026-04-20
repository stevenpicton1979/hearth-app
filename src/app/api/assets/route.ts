import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// Table: assets(id, household_id, name, asset_type, value, notes, as_at, updated_at)
// asset_type: 'property' | 'super' | 'shares' | 'cash' | 'other'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .order('asset_type')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assets: data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, asset_type, value, notes, as_at } = body
  if (!name || !asset_type || value === undefined) {
    return NextResponse.json({ error: 'name, asset_type, value required' }, { status: 400 })
  }
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('assets')
    .insert({
      household_id: DEFAULT_HOUSEHOLD_ID,
      name,
      asset_type,
      value,
      notes: notes || null,
      as_at: as_at || new Date().toISOString().slice(0, 10),
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ asset: data })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  updates.updated_at = new Date().toISOString()
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('assets')
    .update(updates)
    .eq('id', id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ asset: data })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createServerClient()
  const { error } = await supabase
    .from('assets')
    .delete()
    .eq('id', id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
