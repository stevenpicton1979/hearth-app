import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { detectSubscriptions } from '@/lib/subscriptionDetector'
import { Transaction } from '@/lib/types'

export async function GET() {
  const supabase = createServerClient()

  const [{ data: txns }, { data: accounts }] = await Promise.all([
    supabase
      .from('transactions')
      .select('*')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('is_transfer', false)
      .lt('amount', 0)
      .order('date', { ascending: false })
      .limit(2000),
    supabase
      .from('accounts')
      .select('id, display_name')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('is_active', true),
  ])

  const subscriptions = detectSubscriptions((txns || []) as Transaction[], accounts || [])
  return NextResponse.json({ subscriptions })
}
