let cachedToken: { token: string; expiresAt: number } | null = null

export function isBasiqConfigured(): boolean {
  return !!process.env.BASIQ_API_KEY
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token
  const res = await fetch('https://au-api.basiq.io/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.BASIQ_API_KEY}:`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'basiq-version': '3.0',
    },
    body: 'scope=SERVER_ACCESS',
  })
  if (!res.ok) throw new Error(`Basiq auth failed: ${res.statusText}`)
  const data = await res.json()
  cachedToken = { token: data.access_token, expiresAt: Date.now() + 25 * 60 * 1000 }
  return cachedToken.token
}

async function basiqFetch(path: string, options: RequestInit = {}) {
  const token = await getToken()
  const res = await fetch(`https://au-api.basiq.io${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'basiq-version': '3.0', ...options.headers },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { data?: { detail?: string }[] })?.data?.[0]?.detail || res.statusText)
  }
  return res.json()
}

export async function createBasiqUser(email: string) {
  return basiqFetch('/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}

export async function getConsentUrl(userId: string, redirectUrl: string) {
  return basiqFetch(`/users/${userId}/auth_link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile: false, callbackUrl: redirectUrl }),
  })
}

export async function getAccounts(userId: string) {
  const data = await basiqFetch(`/users/${userId}/accounts`)
  return data.data || []
}

export async function getTransactions(userId: string, fromDate?: string) {
  const params = fromDate ? `?filter[transaction.postDate.gte]=${fromDate}` : ''
  const data = await basiqFetch(`/users/${userId}/transactions${params}`)
  return data.data || []
}
