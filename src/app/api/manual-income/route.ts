import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('manual_income_entries')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .order('date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries: data })
}

export async function POST(req: NextRequest) {
  const { date, amount, description, category, recipient, financial_year } = await req.json()
  if (!date || !amount || !description) {
    return NextResponse.json({ error: 'date, amount, description required' }, { status: 400 })
  }
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('manual_income_entries')
    .insert({
      household_id: DEFAULT_HOUSEHOLD_ID,
      date,
      amount: parseFloat(amount),
      description,
      category: category || 'Director Income',
      recipient: recipient || null,
      financial_year: financial_year || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry: data })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createServerClient()
  const { error } = await supabase
    .from('manual_income_entries')
    .delete()
    .eq('id', id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
