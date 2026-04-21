import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { NetWorthClient } from './NetWorthClient'

export default async function NetWorthPage() {
  const supabase = createServerClient()

  const [
    { data: assets },
    { data: liabilities },
    { data: accounts },
    { data: rawSnapshots },
  ] = await Promise.all([
    supabase.from('assets').select('*').eq('household_id', DEFAULT_HOUSEHOLD_ID).order('asset_type').order('name'),
    supabase.from('liabilities').select('*').eq('household_id', DEFAULT_HOUSEHOLD_ID).order('liability_type').order('name'),
    supabase.from('accounts').select('id, display_name, institution, current_balance, last_synced_at, scope').eq('household_id', DEFAULT_HOUSEHOLD_ID).eq('is_active', true),
    supabase.from('net_worth_snapshots').select('*').eq('household_id', DEFAULT_HOUSEHOLD_ID).order('recorded_at', { ascending: true }).limit(24),
  ])

  // Only household + investment accounts count toward net worth headline
  const bankBalance = (accounts || []).reduce((s: number, a) => {
    const scope = (a as { scope: string | null }).scope
    if (scope === 'business') return s
    const bal = (a as { current_balance: number | null }).current_balance
    return s + (bal !== null ? bal : 0)
  }, 0)

  const manualAssetsTotal = (assets || []).reduce((s: number, a) => s + (a as { value: number }).value, 0)
  const totalAssets = manualAssetsTotal + bankBalance
  const totalLiabilities = (liabilities || []).reduce((s: number, l) => s + (l as { balance: number }).balance, 0)
  const netWorth = totalAssets - totalLiabilities

  // Auto-insert today's snapshot if not already recorded
  const todayStr = new Date().toISOString().slice(0, 10)
  const snapshots = rawSnapshots || []
  const hasTodaySnapshot = snapshots.some(s => (s as { recorded_at: string }).recorded_at.startsWith(todayStr))

  let allSnapshots = snapshots
  if (!hasTodaySnapshot) {
    try {
      const { data: newSnap } = await supabase
        .from('net_worth_snapshots')
        .insert({
          household_id: DEFAULT_HOUSEHOLD_ID,
          total_assets: totalAssets,
          total_liabilities: totalLiabilities,
          net_worth: netWorth,
          recorded_at: new Date().toISOString(),
        })
        .select()
        .single()
      if (newSnap) {
        allSnapshots = [...snapshots, newSnap].slice(-24)
      }
    } catch {
      // silently continue if auto-snapshot fails
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Net Worth</h1>
        <p className="text-sm text-gray-500 mt-1">Total assets minus total liabilities.</p>
      </div>
      <NetWorthClient
        assets={assets || []}
        liabilities={liabilities || []}
        accounts={accounts || []}
        snapshots={allSnapshots}
        bankBalance={bankBalance}
        totalAssets={totalAssets}
        totalLiabilities={totalLiabilities}
        netWorth={netWorth}
        hasTodaySnapshot={hasTodaySnapshot || allSnapshots.length > snapshots.length}
      />
    </div>
  )
}
