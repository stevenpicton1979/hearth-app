import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { IncomeEntriesClient } from './IncomeEntriesClient'

export default async function IncomeEntriesPage() {
  const supabase = createServerClient()
  const { data: entries } = await supabase
    .from('manual_income_entries')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .order('date', { ascending: false })

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Income Entries</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manually record income not captured by bank imports (e.g. invoices paid, director fees).
        </p>
      </div>
      <IncomeEntriesClient initialEntries={entries || []} />
    </div>
  )
}
