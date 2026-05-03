import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { detectSubscriptions } from '@/lib/subscriptionDetector'
import { Transaction } from '@/lib/types'
import { SubscriptionsClient, DuplicateSubscription, TimelineItem } from './SubscriptionsClient'

function computeDuplicates(subscriptions: import('@/lib/types').DetectedSubscription[]): DuplicateSubscription[] {
  const byMerchant: Record<string, import('@/lib/types').DetectedSubscription[]> = {}
  for (const sub of subscriptions) {
    if (sub.is_lapsed) continue
    if (!byMerchant[sub.merchant]) byMerchant[sub.merchant] = []
    byMerchant[sub.merchant].push(sub)
  }

  const duplicates: DuplicateSubscription[] = []
  for (const [merchant, subs] of Object.entries(byMerchant)) {
    const uniqueAccounts = new Map<string, import('@/lib/types').DetectedSubscription>()
    for (const sub of subs) {
      if (!uniqueAccounts.has(sub.account_id)) uniqueAccounts.set(sub.account_id, sub)
    }
    if (uniqueAccounts.size < 2) continue

    const accountRows = Array.from(uniqueAccounts.values()).map(sub => ({
      account_id: sub.account_id,
      account_name: sub.account_name,
      amount: sub.amount,
      last_charged: sub.last_charged,
    }))
    const monthlyMultiplier = (sub: import('@/lib/types').DetectedSubscription) => 30 / sub.interval_days
    const monthly_waste = Array.from(uniqueAccounts.values())
      .slice(1)
      .reduce((s, sub) => s + sub.amount * monthlyMultiplier(sub), 0)

    duplicates.push({ merchant, accounts: accountRows, monthly_waste })
  }
  return duplicates.sort((a, b) => b.monthly_waste - a.monthly_waste)
}

function computeTimeline(subscriptions: import('@/lib/types').DetectedSubscription[]): TimelineItem[] {
  const now = new Date()
  const in30 = new Date()
  in30.setDate(in30.getDate() + 30)

  return subscriptions
    .filter(sub => {
      if (sub.is_lapsed) return false
      const nextDate = new Date(sub.next_expected + 'T00:00:00')
      return nextDate <= in30
    })
    .map(sub => ({
      merchant: sub.merchant,
      account_id: sub.account_id,
      amount: sub.amount,
      expected_date: sub.next_expected,
      frequency: sub.frequency,
      is_overdue: new Date(sub.next_expected + 'T00:00:00') < now,
    }))
    .sort((a, b) => a.expected_date.localeCompare(b.expected_date))
}

export default async function SubscriptionsPage() {
  const supabase = createServerClient()

  // ── Accounts ───────────────────────────────────────────────────────────────
  const { data: allAccounts } = await supabase
    .from('accounts')
    .select('id, display_name, scope')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_active', true)

  const householdAccounts = (allAccounts || []).filter(
    a => !(a as { scope: string | null }).scope || (a as { scope: string | null }).scope === 'household'
  )
  const householdIds = householdAccounts.map(a => a.id)
  const accounts = (allAccounts || []).map(a => ({ id: a.id, display_name: (a as { display_name: string }).display_name }))

  // ── Transactions (for detection) ───────────────────────────────────────────
  const txQuery = supabase
    .from('transactions')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_transfer', false)
    .lt('amount', 0)
    .order('date', { ascending: false })
    .limit(2000)

  const { data: transactions } = await (householdIds.length > 0 ? txQuery.in('account_id', householdIds) : txQuery)

  const allDetected = detectSubscriptions(
    (transactions || []) as Transaction[],
    accounts || []
  )

  // ── Merchant mappings ──────────────────────────────────────────────────────
  // Fetch all subscription-related classifications so the client can filter
  // between confirmed, dismissed, and candidate without any server round-trip.
  const { data: mappingRows } = await supabase
    .from('merchant_mappings')
    .select('merchant, classification')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .in('classification', ['Subscription', 'Not a subscription'])

  const confirmedMerchants: string[] = []
  const dismissedMerchants: string[] = []

  for (const row of mappingRows ?? []) {
    if (row.classification === 'Subscription') confirmedMerchants.push(row.merchant as string)
    else if (row.classification === 'Not a subscription') dismissedMerchants.push(row.merchant as string)
  }

  // ── Derived tabs ───────────────────────────────────────────────────────────
  const duplicates = computeDuplicates(allDetected)
  const timeline = computeTimeline(allDetected)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
        <p className="text-sm text-gray-500 mt-1">
          Your recurring charges — confirmed inventory, detection candidates, and dismissed merchants.
        </p>
      </div>
      <SubscriptionsClient
        allDetected={allDetected}
        confirmedMerchants={confirmedMerchants}
        dismissedMerchants={dismissedMerchants}
        duplicates={duplicates}
        timeline={timeline}
        accounts={accounts || []}
      />
    </div>
  )
}
