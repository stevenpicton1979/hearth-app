import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'

export async function GET() {
  const supabase = createServerClient()

  const { data: labels, error } = await supabase
    .from('training_labels')
    .select('merchant, correct_category, correct_classification, is_income, is_transfer, is_subscription')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('status', 'confirmed')
    .order('merchant', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const now = new Date().toISOString().slice(0, 10)
  const entries = (labels || [])
    .map(l => `  {
    merchant: ${JSON.stringify(l.merchant)},
    correctCategory: ${JSON.stringify(l.correct_category)},
    correctClassification: ${JSON.stringify(l.correct_classification)},
    isIncome: ${l.is_income},
    isTransfer: ${l.is_transfer},
    isSubscription: ${l.is_subscription},
  }`)
    .join(',\n')

  const output = `// Auto-generated from Ground Truth Training labels
// Last exported: ${now}
// DO NOT EDIT MANUALLY — regenerate from /dev/training

export const groundTruthFixtures = [
${entries}
] as const
`

  return new NextResponse(output, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'inline; filename="groundTruth.fixtures.ts"',
    },
  })
}
