import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// Table: net_worth_snapshots(id, household_id, total_assets, total_liabilities, net_worth, recorded_at)
// See migration: supabase/migrations/002_net_worth_snapshots.sql

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('net_worth_snapshots')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .order('recorded_at', { ascending: true })
    .limit(24)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ snapshots: data })
}

export async function POST() {
  // Record a snapshot of current net worth
  const supabase = createServerClient()
  const [{ data: assets }, { data: liabilities }] = await Promise.all([
    supabase.from('assets').select('value').eq('household_id', DEFAULT_HOUSEHOLD_ID),
    supabase.from('liabilities').select('balance').eq('household_id', DEFAULT_HOUSEHOLD_ID),
  ])
  const total_assets = (assets || []).reduce((s: number, a: { value: number }) => s + a.value, 0)
  const total_liabilities = (liabilities || []).reduce((s: number, l: { balance: number }) => s + l.balance, 0)
  const net_worth = total_assets - total_liabilities
  const { data, error } = await supabase
    .from('net_worth_snapshots')
    .insert({ household_id: DEFAULT_HOUSEHOLD_ID, total_assets, total_liabilities, net_worth })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ snapshot: data })
}
