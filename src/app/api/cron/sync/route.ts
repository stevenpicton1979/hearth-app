import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Delegate to sync endpoint
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hearth-app-kappa.vercel.app'
  const res = await fetch(`${siteUrl}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const data = await res.json()
  return NextResponse.json({ ok: true, ...data })
}
