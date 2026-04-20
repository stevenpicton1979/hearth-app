import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const account = searchParams.get('account')
  const category = searchParams.get('category')
  const classification = searchParams.get('classification')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const search = searchParams.get('search')
  const showTransfers = searchParams.get('show_transfers') === 'true'
  const page = parseInt(searchParams.get('page') || '0')
  const limit = 50

  const supabase = createServerClient()
  let query = supabase
    .from('transactions')
    .select('*, accounts(display_name, institution)', { count: 'exact' })
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .order('date', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)

  if (!showTransfers) query = query.eq('is_transfer', false)
  if (account) query = query.eq('account_id', account)
  if (category === '__uncategorised') query = query.is('category', null)
  else if (category) query = query.eq('category', category)
  if (classification) query = query.eq('classification', classification)
  if (from) query = query.gte('date', from)
  if (to) query = query.lte('date', to)
  if (search) query = query.ilike('merchant', `%${search}%`)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transactions: data, count })
}
