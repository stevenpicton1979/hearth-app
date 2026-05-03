import { NextRequest } from 'next/server'
import { POST as syncPost } from '@/app/api/xero/sync/route'

// ---------------------------------------------------------------------------
// Thin wrapper around POST /api/xero/sync so the wipe-and-resync endpoint
// can call the sync without duplicating 300+ lines of pipeline logic.
// Mockable in tests via vi.mock('@/lib/xeroSyncRunner').
// ---------------------------------------------------------------------------

export type XeroSyncResult = {
  synced: number
  skipped: number
  backfilled: number
  errors: string[]
}

export async function runXeroFullSync(): Promise<XeroSyncResult> {
  const req = new NextRequest('http://localhost/api/xero/sync?full=true', { method: 'POST' })
  const res = await syncPost(req)
  const data = await res.json() as Partial<XeroSyncResult> & { error?: string }

  if (data.error) {
    return { synced: 0, skipped: 0, backfilled: 0, errors: [data.error] }
  }

  return {
    synced: data.synced ?? 0,
    skipped: data.skipped ?? 0,
    backfilled: data.backfilled ?? 0,
    errors: data.errors ?? [],
  }
}
