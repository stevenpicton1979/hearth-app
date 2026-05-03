import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { detectSubscriptions } from '@/lib/subscriptionDetector'
import { Transaction, DetectedSubscription, Subscription } from '@/lib/types'
import { SubscriptionsClient, DuplicateSubscription, TimelineItem } from './SubscriptionsClient'

function computeDuplicates(detected: DetectedSubscription[]): DuplicateSubscription[] {
  // Each detected entry is already aggregated across all merchants + accounts for the
  // group. Duplicates are now rare (same service charged from 2 accounts).
  // Group by display_name to catch that case.
  const byName: Record<string, DetectedSubscription[]> = {}
  for (const sub of detected) {
    if (sub.is_lapsed) continue
    const key = sub.subscription_id ?? sub.merchant
    if (!byName[key]) byName[key] = []
    byName[key].push(sub)
  }

  const duplicates: DuplicateSubscription[] = []
  for (const subs of Object.values(byName)) {
    const uniqueAccounts = new Map<string, DetectedSubscription>()
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
    const monthlyMultiplier = (sub: DetectedSubscription) => 30 / sub.interval_days
    const monthly_waste = Array.from(uniqueAccounts.values())
      .slice(1)
      .reduce((s, sub) => s + sub.amount * monthlyMultiplier(sub), 0)
    duplicates.push({ merchant: subs[0].display_name, accounts: accountRows, monthly_waste })
  }
  return duplicates.sort((a, b) => b.monthly_waste - a.monthly_waste)
}

function computeTimeline(detected: DetectedSubscription[]): TimelineItem[] {
  const now = new Date()
  const in30 = new Date()
  in30.setDate(in30.getDate() + 30)

  return detected
    .filter(sub => {
      if (sub.is_lapsed) return false
      const nextDate = new Date(sub.next_expected + 'T00:00:00')
      return nextDate <= in30
    })
    .map(sub => ({
      merchant: sub.display_name,
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
    .select('id, display_name')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_active', true)

  const accounts = (allAccounts || []).map(a => ({
    id: a.id,
    display_name: (a as { display_name: string }).display_name,
  }))

  // ── Subscriptions from new tables ──────────────────────────────────────────
  const { data: subRows } = await supabase
    .from('subscriptions')
    .select('id, name, cancellation_url, account_email, notes, auto_renews, next_renewal_override, category, is_active, created_at, updated_at, subscription_merchants(merchant)')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .order('name')

  // Build lookup maps for detection
  const merchantToSubId = new Map<string, string>()
  const subNames = new Map<string, string>()
  for (const sub of subRows ?? []) {
    subNames.set(sub.id, sub.name)
    for (const link of (sub.subscription_merchants ?? []) as { merchant: string }[]) {
      merchantToSubId.set(link.merchant, sub.id)
    }
  }

  // Helper to shape DB rows into Subscription objects
  const toSubscription = (s: typeof subRows extends (infer T)[] | null ? T : never): Subscription => ({
    id: s.id,
    household_id: DEFAULT_HOUSEHOLD_ID,
    name: s.name,
    cancellation_url: s.cancellation_url ?? null,
    account_email: s.account_email ?? null,
    notes: s.notes ?? null,
    auto_renews: s.auto_renews ?? true,
    next_renewal_override: s.next_renewal_override ?? null,
    category: s.category ?? null,
    is_active: s.is_active ?? true,
    merchants: ((s.subscription_merchants ?? []) as { merchant: string }[]).map(m => m.merchant),
    created_at: s.created_at,
    updated_at: s.updated_at,
  })

  const activeSubscriptions: Subscription[] = (subRows ?? []).filter(s => s.is_active).map(toSubscription)
  const dismissedSubscriptions: Subscription[] = (subRows ?? []).filter(s => !s.is_active).map(toSubscription)

  // ── Transactions + detection ───────────────────────────────────────────────
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_transfer', false)
    .lt('amount', 0)
    .order('date', { ascending: false })
    .limit(2000)

  const allDetected = detectSubscriptions(
    (transactions || []) as Transaction[],
    accounts,
    { merchantToSubId, subNames }
  )

  // Detection data keyed by subscription_id for enriching confirmed rows
  const detectedBySubId: Record<string, DetectedSubscription> = {}
  for (const d of allDetected) {
    if (d.subscription_id) detectedBySubId[d.subscription_id] = d
  }

  // ── Dismissed merchant candidates (not-a-subscription dismissals) ──────────
  const { data: dismissedMappings } = await supabase
    .from('merchant_mappings')
    .select('merchant')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('classification', 'Not a subscription')

  const dismissedMerchants = (dismissedMappings ?? []).map(r => r.merchant as string)
  const dismissedSet = new Set(dismissedMerchants)

  // ── Candidate list: detected merchants not linked to any active subscription ─
  const candidateList = allDetected.filter(
    d => d.subscription_id === null && !dismissedSet.has(d.merchant)
  )

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
        activeSubscriptions={activeSubscriptions}
        dismissedSubscriptions={dismissedSubscriptions}
        candidateList={candidateList}
        detectedBySubId={detectedBySubId}
        dismissedMerchants={dismissedMerchants}
        duplicates={duplicates}
        timeline={timeline}
        accounts={accounts}
      />
    </div>
  )
}
