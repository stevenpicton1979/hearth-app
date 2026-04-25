import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

const VALID_SCOPES = ['household', 'business', 'investment']
const VALID_OWNERS = ['Steven', 'Nicola', 'Joint', 'Business']

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if ('scope' in body) {
    if (!VALID_SCOPES.includes(body.scope)) {
      return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
    }
    updates.scope = body.scope
  }

  if ('owner' in body) {
    if (body.owner !== null && body.owner !== '' && !VALID_OWNERS.includes(body.owner)) {
      return NextResponse.json({ error: 'Invalid owner' }, { status: 400 })
    }
    updates.owner = body.owner || null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { error } = await supabase
    .from('accounts')
    .update(updates)
    .eq('id', params.id)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
