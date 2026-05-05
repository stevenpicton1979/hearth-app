import { createServerClient } from './supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from './constants'
import { parseXeroContactName } from './xeroContactParser'

export interface LinkTransferResult {
  pairs: number
  glPropagated: number
  contactExtracted: number
}

// Link transfer pairs within the household for the given dates.
// A pair is two rows on the same date, different accounts, where
// amount + other_amount = 0 and at least one side has gl_account set
// (Xero-sourced). The gl_account requirement prevents pairing coincidental
// same-day same-amount transactions; it also covers Wages Payable BHT debits
// which are classified as Payroll Expense (not is_transfer) on the Xero side.
//
// After pairing, the linker propagates BHT-side metadata to the personal side:
//   linked_gl_account  ← BHT row's gl_account
//   contact_name       ← first pipe-segment of BHT row's raw_description
// This allows reprocess-csv to reclassify personal-side credits (e.g. wages,
// director drawings) that were initially caught as generic transfers.
export async function linkTransferPairs(dates?: string[]): Promise<LinkTransferResult> {
  // Empty array means "nothing to process" (incremental sync with no new dates).
  if (dates !== undefined && dates.length === 0) {
    return { pairs: 0, glPropagated: 0, contactExtracted: 0 }
  }

  // Defensive guard: a very large dates array produces a URL that exceeds
  // PostgREST's ~8 KB limit and silently returns nothing. Callers doing a
  // full backfill should omit `dates` instead.
  if (dates !== undefined && dates.length > 500) {
    throw new Error(
      'linkTransferPairs: dates array too large (>500). Omit the dates argument to process all unlinked rows.'
    )
  }

  const supabase = createServerClient()

  // Supabase PostgREST enforces a server-side 1000-row cap that .limit() cannot
  // override. Paginate with .range() until we get a page shorter than PAGE_SIZE.
  const PAGE_SIZE = 1000

  // Build a page query at `offset`. When `dates` is provided (incremental sync),
  // adds an .in() filter so only those dates are scanned.
  const buildQuery = (offset: number) => {
    let q = supabase
      .from('transactions')
      .select('id, account_id, date, amount, is_transfer, gl_account, raw_description')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .is('linked_transfer_id', null)
      .range(offset, offset + PAGE_SIZE - 1)
    if (dates !== undefined) q = q.in('date', dates)
    return q
  }

  const { data: firstPage, error: firstErr } = await buildQuery(0)
  if (firstErr) throw firstErr
  const allRows = [...(firstPage ?? [])]
  let lastPageFull = allRows.length === PAGE_SIZE

  for (let from = PAGE_SIZE; lastPageFull; from += PAGE_SIZE) {
    const { data: page, error } = await buildQuery(from)
    if (error) throw error
    if (!page) break
    allRows.push(...page)
    lastPageFull = page.length === PAGE_SIZE
  }

  if (allRows.length === 0) return { pairs: 0, glPropagated: 0, contactExtracted: 0 }

  // Group by date for O(n) pairing
  const byDate = new Map<string, typeof allRows>()
  for (const row of allRows) {
    if (!byDate.has(row.date)) byDate.set(row.date, [])
    byDate.get(row.date)!.push(row)
  }

  type PairUpdate = {
    id: string
    linked_id: string
    linked_gl_account?: string | null
    contact_name?: string | null
  }

  const updates: PairUpdate[] = []
  const paired = new Set<string>()

  for (const dayRows of Array.from(byDate.values())) {
    for (let i = 0; i < dayRows.length; i++) {
      const a = dayRows[i]
      if (paired.has(a.id)) continue
      for (let j = i + 1; j < dayRows.length; j++) {
        const b = dayRows[j]
        if (paired.has(b.id)) continue
        if (a.account_id === b.account_id) continue
        // Pair if at least one side has gl_account set (Xero-sourced) — that's
        // the signal we propagate. Without this gate, we'd risk pairing
        // coincidental same-day same-amount transactions (e.g. a refund and an
        // unrelated purchase). With it, we only pair true cross-account flows
        // where Xero has classified one side.
        if (!a.gl_account && !b.gl_account) continue
        // Integer-cent comparison avoids floating point issues
        if (Math.round(a.amount * 100) + Math.round(b.amount * 100) !== 0) continue

        // Identify the BHT side (negative amount = BHT debit) for metadata propagation.
        // gl_account and raw_description are set on Xero-synced transactions (BHT side).
        const bhtSide = a.gl_account ? a : b.gl_account ? b : null
        const personalSide = bhtSide === a ? b : a

        const linkedGlAccount = bhtSide?.gl_account ?? null
        const contactName = parseXeroContactName(bhtSide?.raw_description)

        updates.push({ id: a.id, linked_id: b.id })
        updates.push({ id: b.id, linked_id: a.id })

        // Propagate BHT metadata to the personal side only
        if (bhtSide && (linkedGlAccount || contactName)) {
          const personalUpdate = updates[updates.length - (personalSide === b ? 1 : 2)]
          personalUpdate.linked_gl_account = linkedGlAccount
          personalUpdate.contact_name = contactName
        }

        paired.add(a.id)
        paired.add(b.id)
        break
      }
    }
  }

  if (updates.length === 0) return { pairs: 0, glPropagated: 0, contactExtracted: 0 }

  let glPropagated = 0
  let contactExtracted = 0

  await Promise.all(
    updates.map(({ id, linked_id, linked_gl_account, contact_name }) => {
      const payload: Record<string, unknown> = { linked_transfer_id: linked_id }
      if (linked_gl_account !== undefined) {
        payload.linked_gl_account = linked_gl_account
        if (linked_gl_account !== null) glPropagated++
      }
      if (contact_name !== undefined) {
        payload.contact_name = contact_name
        if (contact_name !== null) contactExtracted++
      }
      return supabase.from('transactions').update(payload).eq('id', id)
    })
  )

  return { pairs: updates.length / 2, glPropagated, contactExtracted }
}
