import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import {
  payloadFor,
  REVERT_PAYLOAD,
  isYearEndClassification,
  YearEndClassification,
} from '@/lib/yearEnd'

// ---------------------------------------------------------------------------
// POST /api/year-end/classify
// Body: { ids: string[], classification: YearEndClassification | 'revert' }
// Applies the classification payload to the given transaction IDs in one
// atomic UPDATE. Returns { updated, classification }.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const { ids, classification } = body as { ids?: unknown; classification?: unknown }

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === 'string' && id.length > 0)) {
    return NextResponse.json({ error: 'ids must be a non-empty string array' }, { status: 400 })
  }

  if (typeof classification !== 'string') {
    return NextResponse.json({ error: 'classification is required' }, { status: 400 })
  }

  let payload: ReturnType<typeof payloadFor>
  let classificationOut: YearEndClassification | 'revert'

  if (classification === 'revert') {
    payload = REVERT_PAYLOAD
    classificationOut = 'revert'
  } else if (isYearEndClassification(classification)) {
    payload = payloadFor(classification)
    classificationOut = classification
  } else {
    return NextResponse.json({ error: 'unknown classification' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { error } = await supabase
    .from('transactions')
    .update(payload)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .in('id', ids as string[])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ updated: ids.length, classification: classificationOut })
}
