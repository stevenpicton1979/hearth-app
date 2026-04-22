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
      account_id: sub.account_id,
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

  const { data: allAccounts } = await supabase
    .from('accounts')
    .select('id, display_name, scope')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_active', true)

  const householdIds = (allAccounts || [])
    .filter(a => !(a as { scope: string | null }).scope || (a as { scope: string | null }).scope === 'household')
    .map(a => a.id)

  const txQuery = supabase
    .from('transactions')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_transfer', false)
    .lt('amount', 0)
    .order('date', { ascending: false })
    .limit(2000)

  const { data: transactions } = await (householdIds.length > 0 ? txQuery.in('account_id', householdIds) : txQuery)
  const accounts = (allAccounts || []).map(a => ({ id: a.id, display_name: (a as { display_name: string }).display_name }))

  const detected = detectSubscriptions(
    (transactions || []) as Transaction[],
    accounts || []
  )

  // Filter out merchants the user has dismissed
  const { data: dismissedMappings } = await supabase
    .from('merchant_mappings')
    .select('merchant')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('classification', 'Not a subscription')

  const dismissedSet = new Set((dismissedMappings || []).map((m: { merchant: string }) => m.merchant))
  const filteredDetected = detected.filter(s => !dismissedSet.has(s.merchant))

  const duplicates = computeDuplicates(filteredDetected)
  const timeline = computeTimeline(filteredDetected)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
        <p className="text-sm text-gray-500 mt-1">
          Auto-detected recurring charges from your transaction history.
        </p>
      </div>
      <SubscriptionsClient subscriptions={filteredDetected} duplicates={duplicates} timeline={timeline} accounts={accounts || []} />
    </div>
  )
}
