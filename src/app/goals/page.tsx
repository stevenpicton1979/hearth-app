import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { GoalsClient } from './GoalsClient'

export default async function GoalsPage() {
  const supabase = createServerClient()
  const [{ data: goals }, { data: accounts }] = await Promise.all([
    supabase
      .from('goals')
      .select('*')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .order('created_at', { ascending: false }),
    supabase
      .from('accounts')
      .select('id, display_name, current_balance')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('is_active', true),
  ])
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Goals</h1>
      <GoalsClient initialGoals={goals || []} accounts={accounts || []} />
    </div>
  )
}
