import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { DEFAULT_HOUSEHOLD_ID } from '@/lib/constants'
import { guessCategory } from '@/lib/autoCategory'
import { isTransfer } from '@/lib/transferPatterns'

export async function POST() {
  const supabase = createServerClient()

  const { data: labels, error } = await supabase
    .from('training_labels')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('status', 'confirmed')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!labels?.length) return NextResponse.json({ error: 'No confirmed labels' }, { status: 400 })

  type EvalResult = {
    merchant: string
    correctCategory: string | null
    detectedCategory: string | null
    correctIsIncome: boolean
    detectedIsIncome: boolean
    correctIsTransfer: boolean
    detectedIsTransfer: boolean
    totalSpend: number
    categoryMatch: boolean
    incomeMatch: boolean
    transferMatch: boolean
    holdout: boolean
  }

  const results: EvalResult[] = labels.map(label => {
    const detected = guessCategory(label.merchant)
    const detectedTransfer = isTransfer(label.merchant)
    // Income: no amount data here, rely on label
    const categoryMatch = detected === label.correct_category
    const incomeMatch = label.is_income === false // income detection not testable without amount
    const transferMatch = detectedTransfer === label.is_transfer

    return {
      merchant: label.merchant,
      correctCategory: label.correct_category,
      detectedCategory: detected,
      correctIsIncome: label.is_income,
      detectedIsIncome: false,
      correctIsTransfer: label.is_transfer,
      detectedIsTransfer: detectedTransfer,
      totalSpend: 0, // populated below
      categoryMatch,
      incomeMatch,
      transferMatch,
      holdout: label.holdout,
    }
  })

  // Enrich with spend data
  const merchants = results.map(r => r.merchant)
  const { data: txns } = await supabase
    .from('transactions')
    .select('merchant, amount')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .in('merchant', merchants)

  const spendByMerchant: Record<string, number> = {}
  for (const t of txns || []) {
    spendByMerchant[t.merchant] = (spendByMerchant[t.merchant] || 0) + Math.abs(t.amount)
  }
  for (const r of results) r.totalSpend = spendByMerchant[r.merchant] || 0

  const benchmarkResults = results.filter(r => !r.holdout)
  const holdoutResults = results.filter(r => r.holdout)

  function computeMetrics(subset: EvalResult[]) {
    if (subset.length === 0) return null
    const catCorrect = subset.filter(r => r.categoryMatch).length
    const transferCorrect = subset.filter(r => r.transferMatch).length
    const totalSpend = subset.reduce((s, r) => s + r.totalSpend, 0)
    const weightedCorrect = subset.filter(r => r.categoryMatch).reduce((s, r) => s + r.totalSpend, 0)

    const covered = subset.filter(r => r.detectedCategory !== null).length
    const failures = subset.filter(r => !r.categoryMatch)

    return {
      total: subset.length,
      categoryAccuracy: catCorrect / subset.length,
      categoryCorrect: catCorrect,
      transferAccuracy: transferCorrect / subset.length,
      transferCorrect,
      dollarWeightedAccuracy: totalSpend > 0 ? weightedCorrect / totalSpend : 0,
      coverage: covered / subset.length,
      covered,
      failures: failures.map(r => ({
        merchant: r.merchant,
        detected: r.detectedCategory,
        correct: r.correctCategory,
        spend: r.totalSpend,
      })).sort((a, b) => b.spend - a.spend),
      topUncovered: subset
        .filter(r => r.detectedCategory === null)
        .sort((a, b) => b.totalSpend - a.totalSpend)
        .slice(0, 5)
        .map(r => ({ merchant: r.merchant, spend: r.totalSpend })),
    }
  }

  const benchmarkMetrics = computeMetrics(benchmarkResults)
  const holdoutMetrics = computeMetrics(holdoutResults)

  const possibleOverfit =
    holdoutMetrics && benchmarkMetrics &&
    benchmarkMetrics.categoryAccuracy - holdoutMetrics.categoryAccuracy > 0.1

  return NextResponse.json({
    benchmark: benchmarkMetrics,
    holdout: holdoutMetrics,
    possibleOverfit,
    allResults: results,
  })
}
