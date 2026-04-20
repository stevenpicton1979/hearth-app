import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { detectSubscriptions } from '@/lib/subscriptionDetector'
import { Transaction, DetectedSubscription } from '@/lib/types'
import { SubscriptionsClient, DuplicateSubscription, TimelineItem } from './SubscriptionsClient'

function computeDuplicates(subscriptions: DetectedSubscription[]): DuplicateSubscription[] {
  // Group active (non-lapsed) subscriptions by merchant
  const byMerchant: Record<string, DetectedSubscription[]> = {}
  for (const sub of subscriptions) {
    if (sub.is_lapsed) continue
    if (!byMerchant[sub.merchant]) byMerchant[sub.merchant] = []
    byMerchant[sub.merchant].push(sub)
  }

  const duplicates: DuplicateSubscription[] = []
  for (const [merchant, subs] of Object.entries(byMerchant)) {
    // Find subs on different accounts
    const uniqueAccounts = new Map<string, DetectedSubscription>()
    for (const sub of subs) {
      if (!uniqueAccounts.has(sub.account_id)) {
        uniqueAccounts.set(sub.account_id, sub)
      }
    }
    if (uniqueAccounts.size < 2) continue

    const accountRows = Array.from(uniqueAccounts.values()).map(sub => ({
      account_id: sub.account_id,
      account_name: sub.account_name,
      amount: sub.amount,
      last_charged: sub.last_charged,
    }))

    // Monthly waste: sum of all but the cheapest
    const monthlyMultiplier = (sub: DetectedSubscription) => 30 / sub.interval_days
    const monthly_waste = Array.from(uniqueAccounts.values())
      .slice(1) // all but the first (cheapest to most expensive)
      .reduce((s, sub) => s + sub.amount * monthlyMultiplier(sub), 0)

    duplicates.push({ merchant, accounts: accountRows, monthly_waste })
  }

  return duplicates.sort((a, b) => b.monthly_waste - a.monthly_waste)
}

function computeTimeline(subscriptions: DetectedSubscription[]): TimelineItem[] {
  const now = new Date()
  const in30 = new Date()
  in30.setDate(in30.getDate() + 30)

  const items: TimelineItem[] = []

  for (const sub of subscriptions) {
    if (sub.is_lapsed) continue
    const nextDate = new Date(sub.next_expected + 'T00:00:00')
    if (nextDate > in30) continue

    items.push({
      merchant: sub.merchant,
      account_name: sub.account_name,
      amount: sub.amount,
      expected_date: sub.next_expected,
      frequency: sub.frequency,
      is_overdue: nextDate < now,
    })
  }

  return items.sort((a, b) => a.expected_date.localeCompare(b.expected_date))
}

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

  const duplicates = computeDuplicates(detected)
  const timeline = computeTimeline(detected)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
        <p className="text-sm text-gray-500 mt-1">
          Auto-detected recurring charges from your transaction history.
        </p>
      </div>
      <SubscriptionsClient subscriptions={detected} duplicates={duplicates} timeline={timeline} />
    </div>
  )
}
