import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { detectSubscriptions } from '@/lib/subscriptionDetector'
import { Transaction } from '@/lib/types'
import { SubscriptionsClient } from './SubscriptionsClient'

export default async function SubscriptionsPage() {
  const supabase = createServerClient()

  const [{ data: transactions }, { data: accounts }] = await Promise.all([
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

  const detected = detectSubscriptions(
    (transactions || []) as Transaction[],
    accounts || []
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
        <p className="text-sm text-gray-500 mt-1">
          Auto-detected recurring charges from your transaction history.
        </p>
      </div>
      <SubscriptionsClient subscriptions={detected} />
    </div>
  )
}
