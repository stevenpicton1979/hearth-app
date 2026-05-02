import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { getOutcomeBucket, formatBucketPath } from '@/lib/categories'

// ---------------------------------------------------------------------------
// GET /api/dev/buckets
//
// Query params:
//   months=N  number of months to look back (default 12, max 36)
// ---------------------------------------------------------------------------

interface BucketRow {
  bucket: string[]
  label: string
  totalAmount: number
  count: number
}

export async function GET(req: NextRequest) {
  const rawMonths = parseInt(req.nextUrl.searchParams.get('months') ?? '12', 10)
  const periodMonths = Math.min(Math.max(rawMonths, 1), 36)

  const since = new Date()
  since.setMonth(since.getMonth() - periodMonths)
  const sinceDate = since.toISOString().slice(0, 10)

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('owner, is_income, is_subscription, category, amount, date')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_transfer', false)
    .gte('date', sinceDate)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const groups = new Map<string, { bucket: string[]; totalAmount: number; count: number }>()

  for (const tx of data ?? []) {
    const bucket = getOutcomeBucket({
      owner: tx.owner as string | null,
      isIncome: tx.is_income as boolean,
      isSubscription: tx.is_subscription as boolean,
      category: tx.category as string | null,
    })
    const key = bucket.join('|')
    const existing = groups.get(key)
    if (existing) {
      existing.totalAmount += Math.abs(tx.amount as number)
      existing.count++
    } else {
      groups.set(key, { bucket, totalAmount: Math.abs(tx.amount as number), count: 1 })
    }
  }

  const buckets: BucketRow[] = Array.from(groups.values())
    .map(g => ({ bucket: g.bucket, label: formatBucketPath(g.bucket), totalAmount: g.totalAmount, count: g.count }))
    .sort((a, b) => b.totalAmount - a.totalAmount)

  return NextResponse.json({ buckets, periodMonths })
}
