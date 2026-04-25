// Link Salary-category transactions across accounts.
//
// When a Xero SPEND-TRANSFER is classified as a wage payment (category=Salary,
// is_transfer=false), the corresponding CBA credit in the personal account is
// also category=Salary, is_transfer=false.  The transferLinker skips these
// because they are not is_transfer=true.  This linker matches them by
// same date + opposite absolute amounts and sets linked_transfer_id on both,
// which lets the training UI show "TO: Bills & Direct Debits" instead of
// the raw merchant name.
//
// Unlike the transferLinker, we do NOT require is_transfer=true on either side.
// We do require:
//   - category = 'Salary' on both rows
//   - same date
//   - amounts sum to zero (one negative, one positive)
//   - different account_ids
//   - linked_transfer_id IS NULL on both (don't re-link already linked rows)

import { createServerClient } from './supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from './constants'

export async function linkSalaryPairs(dates: string[]): Promise<number> {
  if (dates.length === 0) return 0

  const supabase = createServerClient()

  // Fetch all unlinked Salary-category rows for the affected dates
  const { data: rows } = await supabase
    .from('transactions')
    .select('id, account_id, date, amount, category')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('category', 'Salary')
    .in('date', dates)
    .is('linked_transfer_id', null)

  if (!rows || rows.length === 0) return 0

  // Group by date
  const byDate = new Map<string, typeof rows>()
  for (const row of rows) {
    if (!byDate.has(row.date)) byDate.set(row.date, [])
    byDate.get(row.date)!.push(row)
  }

  const updates: Array<{ id: string; linked_id: string }> = []
  const paired = new Set<string>()

  for (const dayRows of Array.from(byDate.values())) {
    for (let i = 0; i < dayRows.length; i++) {
      const a = dayRows[i]
      if (paired.has(a.id)) continue

      for (let j = i + 1; j < dayRows.length; j++) {
        const b = dayRows[j]
        if (paired.has(b.id)) continue
        if (a.account_id === b.account_id) continue

        // Amounts must sum to zero (opposite signs, same absolute value)
        if (Math.round(a.amount * 100) + Math.round(b.amount * 100) !== 0) continue

        updates.push({ id: a.id, linked_id: b.id })
        updates.push({ id: b.id, linked_id: a.id })
        paired.add(a.id)
        paired.add(b.id)
        break
      }
    }
  }

  if (updates.length === 0) return 0

  await Promise.all(
    updates.map(({ id, linked_id }) =>
      supabase
        .from('transactions')
        .update({ linked_transfer_id: linked_id })
        .eq('id', id)
    )
  )

  return updates.length / 2
}
