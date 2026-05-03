import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// ---------------------------------------------------------------------------
// GET /api/subscriptions/transactions
//
// Returns transactions sorted by date desc, with account display_name.
// Accepts either:
//   ?merchant=X             — transactions for a single merchant
//   ?subscription_id=Y      — transactions across ALL merchants linked to
//                             that subscription (for multi-merchant drill-down)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const supabase = createServerClient()

  const merchant = req.nextUrl.searchParams.get('merchant')
  const subscriptionId = req.nextUrl.searchParams.get('subscription_id')

  if (!merchant && !subscriptionId) {
    return NextResponse.json({ error: 'merchant or subscription_id required' }, { status: 400 })
  }

  let merchants: string[]

  if (subscriptionId) {
    // Look up all merchant aliases for this subscription
    const { data: links, error: linkErr } = await supabase
      .from('subscription_merchants')
      .select('merchant')
      .eq('subscription_id', subscriptionId)
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)

    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 })
    merchants = (links ?? []).map(l => l.merchant)

    if (merchants.length === 0) {
      return NextResponse.json({ transactions: [] })
    }
  } else {
    merchants = [merchant!]
  }

  const query = supabase
    .from('transactions')
    .select('date, amount, raw_description, description, merchant, account_id, category, classification, gl_account, external_id, accounts(display_name)')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .order('date', { ascending: false })

  const { data, error } = merchants.length === 1
    ? await query.eq('merchant', merchants[0])
    : await query.in('merchant', merchants)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const transactions = (data ?? []).map(tx => ({
    date: tx.date,
    amount: tx.amount,
    raw_description: tx.raw_description,
    description: tx.description,
    merchant: tx.merchant,
    account_id: tx.account_id,
    account_name: (tx.accounts as unknown as { display_name: string } | null)?.display_name ?? null,
    category: tx.category,
    classification: tx.classification,
    gl_account: tx.gl_account,
    external_id: tx.external_id,
  }))

  return NextResponse.json({ transactions })
}
