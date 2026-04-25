import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { isBasiqConfigured } from '@/lib/basiq'
import Link from 'next/link'
import { BanknotesIcon, ArrowPathIcon, InformationCircleIcon } from '@heroicons/react/24/outline'
import AccountScopeSelect from './AccountScopeSelect'
import AccountOwnerSelect from './AccountOwnerSelect'

export default async function AccountsPage() {
  const supabase = createServerClient()
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_active', true)
    .order('display_name')

  const basiqReady = isBasiqConfigured()

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bank Accounts</h1>
        {basiqReady && (
          <button className="bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-800 transition-colors flex items-center gap-2">
            <BanknotesIcon className="h-4 w-4" />
            Connect a bank
          </button>
        )}
      </div>

      {!basiqReady && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex gap-3">
          <InformationCircleIcon className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Bank connection not configured</p>
            <p className="text-sm text-amber-700 mt-1">
              Open Banking via Basiq requires an API key. In the meantime, use CSV import to add transactions.
            </p>
            <Link href="/import" className="text-sm text-emerald-700 font-medium hover:underline mt-2 inline-block">
              Import CSV →
            </Link>
          </div>
        </div>
      )}

      {accounts && accounts.length > 0 ? (
        <div className="space-y-3">
          {accounts.map((account) => (
            <div key={account.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{account.display_name}</p>
                <p className="text-sm text-gray-500">
                  {account.institution || 'Manual'} · {account.account_type || 'transaction'}
                </p>
                {account.last_synced_at && (
                  <p className="text-xs text-gray-400 mt-1">
                    Last synced {new Date(account.last_synced_at).toLocaleDateString('en-AU')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap justify-end">
                <AccountOwnerSelect accountId={account.id} initialOwner={account.owner ?? null} />
                <AccountScopeSelect accountId={account.id} initialScope={account.scope ?? 'household'} />
                {account.basiq_account_id && (
                  <form action="/api/sync" method="post">
                    <input type="hidden" name="account_id" value={account.id} />
                    <button type="submit" className="p-2 text-gray-400 hover:text-emerald-700 transition-colors">
                      <ArrowPathIcon className="h-5 w-5" />
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <BanknotesIcon className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No accounts yet.</p>
          <Link href="/import" className="text-sm text-emerald-700 font-medium hover:underline mt-2 inline-block">
            Import your first CSV →
          </Link>
        </div>
      )}
    </div>
  )
}
