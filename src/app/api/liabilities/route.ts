import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// Table: liabilities(id, household_id, name, liability_type, balance, as_at, updated_at)
// liability_type: 'mortgage' | 'personal_loan' | 'car_loan' | 'credit_card' | 'bnpl' | 'other'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('liabilities')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .order('liability_type')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ liabilities: data })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, liability_type, balance, as_at } = body
  if (!name || !liability_type || balance === undefined) {
    return NextResponse.json({ error: 'name, liability_type, balance required' }, { status: 400 })
  }
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('liabilities')
    .insert({
      household_id: DEFAULT_HOUSEHOLD_ID,
      name,
      liability_type,
      balance,
      as_at: as_at || new Date().toISOString().slice(0, 10),
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ liability: data })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  updates.updated_at = new Date().toISOString()
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('liabilities')
    .update(updates)
    .eq('id', id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ liability: data })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createServerClient()
  const { error } = await supabase
    .from('liabilities')
    .delete()
    .eq('id', id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
