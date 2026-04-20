import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hearth-app-kappa.vercel.app'

  // Step 1: Sync bank transactions
  const syncRes = await fetch(`${siteUrl}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const syncData = await syncRes.json()

  // Step 2: Record a daily net worth snapshot
  let snapshotData: Record<string, unknown> = {}
  try {
    const snapshotRes = await fetch(`${siteUrl}/api/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    snapshotData = await snapshotRes.json()
  } catch {
    snapshotData = { error: 'Failed to record snapshot' }
  }

  return NextResponse.json({ ok: true, sync: syncData, snapshot: snapshotData })
}
