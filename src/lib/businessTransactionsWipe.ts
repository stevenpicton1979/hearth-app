import { createServerClient } from './supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from './constants'

// ---------------------------------------------------------------------------
// Shared logic for wiping business transaction data.
// Used by both:
//   POST /api/admin/wipe-business-transactions  (wipe-only, deprecated)
//   POST /api/admin/wipe-and-resync             (wipe + resync + verify)
// ---------------------------------------------------------------------------

export type WipeAccountResult = { id: string; name: string; count: number }
export type WipeResult = { accounts: WipeAccountResult[]; total: number }

export async function runBusinessTransactionsWipe(dryRun: boolean): Promise<WipeResult> {
  const supabase = createServerClient()

  const { data: accounts, error: acctErr } = await supabase
    .from('accounts')
    .select('id, display_name, institution, scope')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .or('institution.eq.Xero,scope.eq.business')

  if (acctErr) throw new Error(acctErr.message)
  if (!accounts || accounts.length === 0) return { accounts: [], total: 0 }

  const PAGE_SIZE = 1000
  const accountSummary: WipeAccountResult[] = []
  const txIdsToDelete: string[] = []

  for (const acct of accounts) {
    const acctIds: string[] = []
    let page = 0
    while (true) {
      const from = page * PAGE_SIZE
      const { data: txRows, error: txErr } = await supabase
        .from('transactions')
        .select('id')
        .eq('household_id', DEFAULT_HOUSEHOLD_ID)
        .eq('account_id', acct.id)
        .range(from, from + PAGE_SIZE - 1)

      if (txErr) throw new Error(txErr.message)
      for (const row of txRows ?? []) acctIds.push(row.id as string)
      if (!txRows || txRows.length < PAGE_SIZE) break
      page++
    }

    accountSummary.push({ id: acct.id as string, name: acct.display_name as string, count: acctIds.length })
    for (const id of acctIds) txIdsToDelete.push(id)
  }

  const total = txIdsToDelete.length
  const nonEmpty = accountSummary.filter(a => a.count > 0)

  if (dryRun || total === 0) return { accounts: nonEmpty, total }

  const CHUNK = 500
  let deleted = 0
  for (let i = 0; i < txIdsToDelete.length; i += CHUNK) {
    const chunk = txIdsToDelete.slice(i, i + CHUNK)
    const { error: delErr, count } = await supabase
      .from('transactions')
      .delete({ count: 'exact' })
      .in('id', chunk)

    if (delErr) throw new Error(delErr.message)
    deleted += count ?? chunk.length
  }

  return { accounts: nonEmpty, total: deleted }
}
