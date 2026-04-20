import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { NetWorthClient } from './NetWorthClient'

export default async function NetWorthPage() {
  const supabase = createServerClient()

  const [
    { data: assets },
    { data: liabilities },
    { data: accounts },
    { data: snapshots },
  ] = await Promise.all([
    supabase.from('assets').select('*').eq('household_id', DEFAULT_HOUSEHOLD_ID).order('asset_type').order('name'),
    supabase.from('liabilities').select('*').eq('household_id', DEFAULT_HOUSEHOLD_ID).order('liability_type').order('name'),
    supabase.from('accounts').select('id, display_name, institution, current_balance, last_synced_at').eq('household_id', DEFAULT_HOUSEHOLD_ID).eq('is_active', true),
    supabase.from('net_worth_snapshots').select('*').eq('household_id', DEFAULT_HOUSEHOLD_ID).order('recorded_at', { ascending: true }).limit(24),
  ])

  // Compute bank balance from accounts.current_balance
  const bankBalance = (accounts || []).reduce((s: number, a) => s + ((a as { current_balance: number | null }).current_balance || 0), 0)

  // Total assets = manual assets + bank balances
  const manualAssetsTotal = (assets || []).reduce((s: number, a) => s + (a as { value: number }).value, 0)
  const totalAssets = manualAssetsTotal + bankBalance
  const totalLiabilities = (liabilities || []).reduce((s: number, l) => s + (l as { balance: number }).balance, 0)
  const netWorth = totalAssets - totalLiabilities

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
        snapshots={snapshots || []}
        bankBalance={bankBalance}
        totalAssets={totalAssets}
        totalLiabilities={totalLiabilities}
        netWorth={netWorth}
      />
    </div>
  )
}
