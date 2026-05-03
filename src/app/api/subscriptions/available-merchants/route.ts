import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// ---------------------------------------------------------------------------
// GET /api/subscriptions/available-merchants
//
// Returns distinct merchants from recent transactions that are:
//   - Not already linked to any subscription (subscription_merchants)
//   - Not dismissed (merchant_mappings classification = 'Not a subscription')
//
// Used by the "+ Add Merchant Alias" picker in the subscription detail panel.
// ---------------------------------------------------------------------------

export async function GET() {
  const supabase = createServerClient()

  // Merchants already linked to subscriptions
  const { data: linkedRows } = await supabase
    .from('subscription_merchants')
    .select('merchant')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)

  // Dismissed merchants
  const { data: dismissedRows } = await supabase
    .from('merchant_mappings')
    .select('merchant')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('classification', 'Not a subscription')

  // Recent transactions
  const { data: txRows, error: txErr } = await supabase
    .from('transactions')
    .select('merchant')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_transfer', false)
    .lt('amount', 0)
    .order('date', { ascending: false })
    .limit(2000)

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 })

  const linkedSet = new Set((linkedRows ?? []).map(r => r.merchant as string))
  const dismissedSet = new Set((dismissedRows ?? []).map(r => r.merchant as string))

  const available = Array.from(new Set(
    (txRows ?? [])
      .map(r => r.merchant as string)
      .filter(m => m && !linkedSet.has(m) && !dismissedSet.has(m))
  )).sort()

  return NextResponse.json({ merchants: available })
}
