import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

const TOKEN_URL = 'https://identity.xero.com/connect/token'
const CONNECTIONS_URL = 'https://api.xero.com/connections'
const CLIENT_ID = process.env.XERO_CLIENT_ID
const CLIENT_SECRET = process.env.XERO_CLIENT_SECRET
const REDIRECT_URI = process.env.XERO_REDIRECT_URI || 'http://localhost:3000/api/xero/callback'

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const cookieState = req.cookies.get('xero_state')?.value

    // CSRF validation
    if (!state || !cookieState || state !== cookieState) {
      return NextResponse.json({ error: 'State mismatch - CSRF validation failed' }, { status: 400 })
    }

    if (!code) {
      return NextResponse.json({ error: 'No authorization code received' }, { status: 400 })
    }

    if (!CLIENT_ID || !CLIENT_SECRET) {
      return NextResponse.json({ error: 'XERO_CLIENT_ID or XERO_CLIENT_SECRET not configured' }, { status: 500 })
    }

    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    })

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      return NextResponse.json({ error: `Token exchange failed: ${err}` }, { status: 500 })
    }

    const {
      access_token,
      refresh_token,
      expires_in,
    } = await tokenRes.json() as { access_token: string; refresh_token: string; expires_in: number }

    // Get tenant info from connections endpoint
    const connRes = await fetch(CONNECTIONS_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!connRes.ok) {
      const err = await connRes.text()
      return NextResponse.json({ error: `Failed to get tenant info: ${err}` }, { status: 500 })
    }

    const connections = await connRes.json() as Array<{ tenantId: string; tenantName: string }>
    if (!connections || connections.length === 0) {
      return NextResponse.json({ error: 'No Xero tenants found' }, { status: 400 })
    }

    const { tenantId, tenantName } = connections[0]

    // Store connection in database
    const supabase = createServerClient()
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()

    const { error } = await supabase
      .from('xero_connections')
      .upsert(
        {
          household_id: DEFAULT_HOUSEHOLD_ID,
          tenant_id: tenantId,
          tenant_name: tenantName,
          access_token,
          refresh_token,
          expires_at: expiresAt,
        },
        { onConflict: 'household_id,tenant_id' }
      )

    if (error) {
      return NextResponse.json({ error: `Failed to save connection: ${error.message}` }, { status: 500 })
    }

    // Redirect to settings page
    const response = NextResponse.redirect(new URL('/settings/xero', req.url))
    // Clear state cookie
    response.cookies.delete('xero_state')
    return response
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
