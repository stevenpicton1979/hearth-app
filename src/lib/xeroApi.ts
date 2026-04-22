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

  // Check if token is expiring within 5 minutes
  const now = new Date()
  const expiresAt = new Date(connection.expires_at)
  const expiringIn = expiresAt.getTime() - now.getTime()

  if (expiringIn < 5 * 60 * 1000) {
    // Refresh token
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
    throw new Error(`Token refresh failed: ${err}`)
  }

  const { access_token, refresh_token, expires_in } = await res.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  // Update database
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
  Type: string // 'SPEND' | 'RECEIVE'
  Status: string // 'AUTHORISED'
  Date: string // '/Date(1234567890000)/'
  Reference?: string
  Narration?: string
  SubTotal?: number
  TotalTax?: number
  Contact: { Name?: string }
  BankAccount?: { AccountID?: string; Name?: string; Code?: string }
  LineItems: Array<{
    Description?: string
    Quantity?: number
    UnitAmount?: number
    AccountCode?: string
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
 * Paginates through all pages (up to 20) and returns combined results.
 * If sinceDate is provided, uses If-Modified-Since to fetch only new/changed transactions.
 */
export async function getXeroBankTransactions(
  connection: XeroConnection,
  sinceDate?: string
): Promise<{ transactions: XeroBankTransaction[] }> {
  const where = 'Status=="AUTHORISED"'
  const order = 'Date DESC'
  const MAX_PAGES = 20
  const all: XeroBankTransaction[] = []

  for (let page = 1; page <= MAX_PAGES; page++) {
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

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Failed to fetch Xero transactions: ${err}`)
    }

    const data = await res.json() as { BankTransactions?: XeroBankTransaction[] }
    const page_txns = data.BankTransactions || []
    all.push(...page_txns)

    if (page_txns.length === 0) break
  }

  return { transactions: all }
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
    throw new Error(`Failed to fetch Xero accounts: ${err}`)
  }

  const data = await res.json() as { Accounts?: XeroAccount[] }
  const map = ne