import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

// ---------------------------------------------------------------------------
// GET /api/subscriptions/transactions?merchant=X
//
// Returns all transactions for a merchant, sorted by date desc.
// Joins accounts table for display_name. Used by the row drill-down in the
// subscriptions page so the user can see raw transaction data before
// confirming or dismissing a candidate.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const merchant = req.nextUrl.searchParams.get('merchant')
  if (!merchant) return NextResponse.json({ error: 'merchant required' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('date, amount, raw_description, description, merchant, account_id, category, classification, gl_account, external_id, accounts(display_name)')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('merchant', merchant)
    .order('date', { ascending: false })

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
