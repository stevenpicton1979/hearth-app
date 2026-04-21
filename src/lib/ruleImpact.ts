import { Transaction } from './types'
import { cleanMerchant } from './cleanMerchant'

export function ruleImpact(keyword: string, transactions: Transaction[]) {
  const kw = keyword.toLowerCase()
  const matches = transactions.filter(t =>
    cleanMerchant(t.merchant).toLowerCase().includes(kw)
  )
  return {
    matchCount: matches.length,
    totalSpend: matches.reduce((sum, t) => sum + Math.abs(t.amount), 0),
    merchants: Array.from(new Set(matches.map(t => cleanMerchant(t.merchant)))),
    currentCategories: matches.reduce((acc, t) => {
      const cat = t.category ?? 'uncategorised'
      acc[cat] = (acc[cat] || 0) + 1
      return acc
    }, {} as Record<string, number>),
  }
}
