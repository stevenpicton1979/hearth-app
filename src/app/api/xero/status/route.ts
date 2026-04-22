import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export async function GET() {
  try {
    const supabase = createServerClient()
    const { data: connection } = await supabase
      .from('xero_connections')
      .select('tenant_name, updated_at')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .maybeSingle()

    return NextResponse.json({ connection })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
