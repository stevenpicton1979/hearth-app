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

/**
 * Refresh Xero access token using refresh_token.
 */
async function refreshXeroToken(connection: any): Promise<XeroConnection> {
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
  Contact: { Name?: string }
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
 * Fetch bank transactions from Xero API.
 */
export async function getXeroBankTransactions(
  connection: XeroConnection,
  page: number = 1
): Promise<{ transactions: XeroBankTransaction[]; total: number }> {
  const where = 'Status=="AUTHORISED"'
  const order = 'Date DESC'
  const params = new URLSearchParams({ where, order, page: page.toString() })

  const url = `${XERO_API_BASE}/BankTransactions?${params.toString()}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${connection.access_token}`,
      'Xero-tenant-id': connection.tenant_id,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to fetch Xero transactions: ${err}`)
  }

  const data = await res.json() as {
    BankTransactions?: XeroBankTransaction[]
    ApiResponseStatusCode?: number
  }

  return {
    transactions: data.BankTransactions || [],
    total: data.BankTransactions?.length || 0,
  }
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
    },
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to fetch Xero accounts: ${err}`)
  }

  const data = await res.json() as { Accounts?: XeroAccount[] }
  const map = new Map<string, XeroAccount>()
  for (const account of data.Accounts || []) {
    map.set(account.Code, account)
  }
  return map
}
