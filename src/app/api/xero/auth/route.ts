import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize'
const CLIENT_ID = process.env.XERO_CLIENT_ID
const REDIRECT_URI = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}/api/xero/callback`
  : 'http://localhost:3000/api/xero/callback'

const SCOPES = 'openid profile email accounting.transactions.read accounting.accounts.read offline_access'

export async function GET(_req: NextRequest) {
  if (!CLIENT_ID) {
    return NextResponse.json({ error: 'XERO_CLIENT_ID not configured' }, { status: 500 })
  }

  // Generate CSRF state
  const state = crypto.randomBytes(32).toString('hex')

  // Create response with state cookie
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
  })

  const authUrl = `${XERO_AUTH_URL}?${params.toString()}`
  const response = NextResponse.redirect(authUrl)

  // Store state in httpOnly cookie for CSRF validation
  response.cookies.set('xero_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60, // 10 minutes
  })

  return response
}
