import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import {
  fyForDate,
  fyDateRange,
  classificationFromMatchedRule,
  summarizeRows,
  YearEndClassification,
} from '@/lib/yearEnd'

// ---------------------------------------------------------------------------
// GET /api/year-end/provisional?fy=<num>
// Returns all Director Drawings (provisional + already classified) for the
// given Australian FY, plus a summary breakdown.
// `fy` defaults to the FY containing today's date.
// ---------------------------------------------------------------------------

interface RowOut {
  id: string
  date: string
  amount: number
  contact_name: string | null
  linked_gl_account: string | null
  is_provisional: boolean
  matched_rule: string | null
  classification: YearEndClassification | null
}

export async function GET(req: NextRequest) {
  const today = new Date().toISOString().slice(0, 10)
  const fyParam = req.nextUrl.searchParams.get('fy')
  const fy = fyParam ? Number(fyParam) : fyForDate(today)

  if (!Number.isFinite(fy) || fy < 1900 || fy > 2200) {
    return NextResponse.json({ error: 'invalid fy' }, { status: 400 })
  }

  const { startDate, endDate } = fyDateRange(fy)

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('id, date, amount, contact_name, linked_gl_account, is_provisional, matched_rule')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .gte('date', startDate)
    .lte('date', endDate)
    .or('category.eq.Director Drawings,matched_rule.like.year-end:%')
    .order('date', { ascending: false })
    .range(0, 999)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows: RowOut[] = (data ?? []).map(r => ({
    id: r.id as string,
    date: r.date as string,
    amount: r.amount as number,
    contact_name: (r.contact_name as string | null) ?? null,
    linked_gl_account: (r.linked_gl_account as string | null) ?? null,
    is_provisional: (r.is_provisional as boolean) ?? false,
    matched_rule: (r.matched_rule as string | null) ?? null,
    classification: classificationFromMatchedRule((r.matched_rule as string | null) ?? null),
  }))

  const summary = summarizeRows(rows)

  return NextResponse.json({ fy, startDate, endDate, rows, summary })
}
