import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { fyForDate, fyDateRange, classificationFromMatchedRule } from '@/lib/yearEnd'
import { YearEndClient, ClientRow } from './YearEndClient'

export default async function YearEndPage({
  searchParams,
}: {
  searchParams: { fy?: string }
}) {
  const today = new Date().toISOString().slice(0, 10)
  const fyParam = searchParams.fy ? Number(searchParams.fy) : NaN
  const fy = Number.isFinite(fyParam) ? fyParam : fyForDate(today)
  const { startDate, endDate } = fyDateRange(fy)

  const supabase = createServerClient()
  const { data } = await supabase
    .from('transactions')
    .select('id, date, amount, contact_name, linked_gl_account, is_provisional, matched_rule')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .gte('date', startDate)
    .lte('date', endDate)
    .or('category.eq.Director Drawings,matched_rule.like.year-end:%')
    .order('date', { ascending: false })
    .range(0, 999)

  const initialRows: ClientRow[] = (data ?? []).map(r => ({
    id: r.id as string,
    date: r.date as string,
    amount: r.amount as number,
    contact_name: (r.contact_name as string | null) ?? null,
    linked_gl_account: (r.linked_gl_account as string | null) ?? null,
    is_provisional: (r.is_provisional as boolean) ?? false,
    matched_rule: (r.matched_rule as string | null) ?? null,
    classification: classificationFromMatchedRule((r.matched_rule as string | null) ?? null),
  }))

  return <YearEndClient fy={fy} initialRows={initialRows} />
}
