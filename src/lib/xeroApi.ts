import { createServerClient } from './supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from './constants'

const TOKEN_URL = 'https://identity.xero.com/connect/token'
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0'
const CLIENT_ID = process.env.XERO_CLIENT_ID
const CLIENT_SECRET = process.env.XERO_CLIENT_SECRET

interface XeroConnection {
  access_token: string
  refresh_token: string
  expires_at: string
  tenant_id: string
}

/**
 * Get current Xero connection for the household.
 * Automatically refreshes token if needed.
 */
export async function getXeroConnection(): Promise<XeroConnection | null> {
  const supabase = createServerClient()
  const { data: connection } = await supabase
    .from('xero_connections')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .maybeSingle()

  if (!connection) return null

  const now = new Date()
  const expiresAt = new Date(connection.expires_at)
  const expiringIn = expiresAt.getTime() - now.getTime()

  if (expiringIn < 5 * 60 * 1000) {
    return await refreshXeroToken(connection)
  }

  return connection
}

interface XeroConnectionRow {
  id: string
  household_id: string
  tenant_id: string
  access_token: string
  refresh_token: string
  expires_at: string
}

/**
 * Refresh Xero access token using refresh_token.
 */
async function refreshXeroToken(connection: XeroConnectionRow): Promise<XeroConnection> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('XERO_CLIENT_ID or XERO_CLIENT_SECRET not configured')
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: connection.refresh_token,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token refresh failed: HTTP ${res.status} ${res.statusText} — ${err}`)
  }

  const { access_token, refresh_token, expires_in } = await res.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  const supabase = createServerClient()
  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()

  await supabase
    .from('xero_connections')
    .update({ access_token, refresh_token, expires_at: expiresAt })
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('tenant_id', connection.tenant_id)

  return {
    access_token,
    refresh_token,
    expires_at: expiresAt,
    tenant_id: connection.tenant_id,
  }
}

interface XeroBankTransaction {
  BankTransactionID: string
  Type: string
  Status: string
  Date: string
  Reference?: string
  Narration?: string
  Url?: string
  SubTotal?: number
  TotalTax?: number
  Contact: { Name?: string }
  BankAccount?: { AccountID?: string; Name?: string; Code?: string }
  LineItems: Array<{
    Description?: string
    Quantity?: number
    UnitAmount?: number
    AccountCode?: string
    TaxType?: string
    Tracking?: Array<{ Name: string; Option: string }>
  }>
}

interface XeroAccount {
  Code: string
  Name: string
  Type: string
  Status: string
}

/**
 * Fetch bank transactions from Xero API with optional incremental sync.
 * Pages are fetched in parallel batches of 2 to minimise wall-clock time.
 * If sinceDate is provided, uses If-Modified-Since to fetch only new/changed transactions.
 * If accountId is provided, scopes the query to that Xero bank account only and allows
 * deeper pagination (up to 5,000 records) so each account gets complete history.
 */
export async function getXeroBankTransactions(
  connection: XeroConnection,
  sinceDate?: string,
  accountId?: string
): Promise<{ transactions: XeroBankTransaction[] }> {
  // Per-account fetch: scope to one account and paginate deeper (5,000 records max).
  // Global fetch: all accounts but shallower (2,000 records) — used for incremental syncs.
  const where = accountId
    ? `Status=="AUTHORISED"&&BankAccount.AccountID=guid("${accountId}")`
    : 'Status=="AUTHORISED"'
  const order = 'Date DESC'
  const PAGE_SIZE = 100
  const MAX_PAGES = accountId ? 50 : 20
  const BATCH = 2

  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

  const fetchPage = async (page: number, attempt = 0): Promise<XeroBankTransaction[]> => {
    const params = new URLSearchParams({ where, order, page: page.toString() })
    const url = `${XERO_API_BASE}/BankTransactions?${params.toString()}`
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${connection.access_token}`,
      'Xero-tenant-id': connection.tenant_id,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
    if (sinceDate) {
      headers['If-Modified-Since'] = new Date(sinceDate).toUTCString()
    }
    const res = await fetch(url, { method: 'GET', headers })
    if (res.status === 429) {
      if (attempt >= 3) throw new Error(`Failed to fetch Xero transactions (page ${page}): HTTP 429 Too Many Requests — rate limit exceeded after retries`)
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '15', 10)
      await sleep(retryAfter * 1000)
      return fetchPage(page, attempt + 1)
    }
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Failed to fetch Xero transactions (page ${page}): HTTP ${res.status} ${res.statusText} — ${err}`)
    }
    const data = await res.json() as { BankTransactions?: XeroBankTransaction[] }
    return data.BankTransactions || []
  }

  const all: XeroBankTransaction[] = []

  for (let batchStart = 1; batchStart <= MAX_PAGES; batchStart += BATCH) {
    const batchEnd = Math.min(batchStart + BATCH - 1, MAX_PAGES)
    const pages = await Promise.all(
      Array.from({ length: batchEnd - batchStart + 1 }, (_, i) => fetchPage(batchStart + i))
    )
    for (const txns of pages) {
      all.push(...txns)
    }
    if (pages.some(p => p.length < PAGE_SIZE)) break
    // Brief pause between batches to stay well within Xero's rate limits
    if (batchEnd < MAX_PAGES) await sleep(500)
  }

  return { transactions: all }
}

/**
 * Count bank transactions for one Xero account without fetching full records.
 * Paginates up to 5,000 (50 pages × 100) — same cap as the full sync.
 * Excludes RECEIVE-TRANSFER transactions because the sync skips them; only
 * the SPEND-TRANSFER side is stored in Hearth, so counts are comparable.
 */
export async function getXeroBankTransactionCount(
  connection: XeroConnection,
  accountId: string
): Promise<number> {
  const where = `Status=="AUTHORISED"&&Type!="RECEIVE-TRANSFER"&&BankAccount.AccountID=guid("${accountId}")`
  const PAGE_SIZE = 100
  const MAX_PAGES = 50

  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

  const fetchPageCount = async (page: number, attempt = 0): Promise<number> => {
    const params = new URLSearchParams({ where, page: page.toString() })
    const url = `${XERO_API_BASE}/BankTransactions?${params.toString()}`
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${connection.access_token}`,
        'Xero-tenant-id': connection.tenant_id,
        'Accept': 'application/json',
      },
    })
    if (res.status === 429) {
      if (attempt >= 3) throw new Error(`Xero rate limit exceeded counting transactions (page ${page})`)
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '15', 10)
      await sleep(retryAfter * 1000)
      return fetchPageCount(page, attempt + 1)
    }
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Xero BankTransactions count (page ${page}): HTTP ${res.status} — ${err}`)
    }
    const data = await res.json() as { BankTransactions?: unknown[] }
    return data.BankTransactions?.length ?? 0
  }

  let total = 0
  for (let page = 1; page <= MAX_PAGES; page++) {
    const pageCount = await fetchPageCount(page)
    total += pageCount
    if (pageCount < PAGE_SIZE) break
  }
  return total
}

/**
 * Fetch accounts from Xero API to build lookup table.
 */
export async function getXeroAccounts(connection: XeroConnection): Promise<Map<string, XeroAccount>> {
  const url = `${XERO_API_BASE}/Accounts`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${connection.access_token}`,
      'Xero-tenant-id': connection.tenant_id,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to fetch Xero accounts: HTTP ${res.status} ${res.statusText} — ${err}`)
  }

  const data = await res.json() as { Accounts?: XeroAccount[] }
  const map = new Map<string, XeroAccount>()
  for (const account of data.Accounts || []) {
    map.set(account.Code, account)
  }
  return map
}
