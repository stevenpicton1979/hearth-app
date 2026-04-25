import { createServerClient } from './supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from './constants'

// Link transfer pairs within the household for the given dates.
// A pair is two rows on the same date, different accounts, where
// amount + other_amount = 0 and at least one side is flagged is_transfer.
// Returns the number of pairs linked.
export async function linkTransferPairs(dates: string[]): Promise<number> {
  if (dates.length === 0) return 0

  const supabase = createServerClient()

  // Fetch all unlinked rows for the affected dates
  const { data: rows } = await supabase
    .from('transactions')
    .select('id, account_id, date, amount, is_transfer')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .in('date', dates)
    .is('linked_transfer_id', null)

  if (!rows || rows.length === 0) return 0

  // Group by date for O(n) pairing
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
        if (!a.is_transfer && !b.is_transfer) continue
        // Integer-cent comparison avoids floating point issues
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
