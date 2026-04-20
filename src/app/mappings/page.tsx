import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { MappingsTable } from './MappingsTable'

export default async function MappingsPage() {
  const supabase = createServerClient()
  const { data: mappings } = await supabase
    .from('merchant_mappings')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .order('merchant')

  // Get transaction counts per merchant
  const { data: counts } = await supabase
    .from('transactions')
    .select('merchant')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)

  const countMap: Record<string, number> = {}
  for (const t of (counts || [])) {
    countMap[t.merchant] = (countMap[t.merchant] || 0) + 1
  }

  const mappingsWithCounts = (mappings || []).map(m => ({
    ...m,
    transaction_count: countMap[m.merchant] || 0,
  }))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Merchant Mappings</h1>
          <p className="text-sm text-gray-500 mt-1">
            {mappings?.length || 0} rules apply to all future transactions
          </p>
        </div>
      </div>
      <MappingsTable initialMappings={mappingsWithCounts} />
    </div>
  )
}
