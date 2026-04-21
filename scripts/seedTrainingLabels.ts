/**
 * Seeds training_labels from existing transaction data.
 *
 * Prerequisites:
 *   1. Apply scripts/migrate_training_labels.sql in Supabase SQL editor
 *   2. Ensure SUPABASE_SERVICE_ROLE_KEY in .env.local is valid
 *
 * Usage:
 *   node_modules/.bin/sucrase-node scripts/seedTrainingLabels.ts
 *
 * Alternatively, call POST /api/dev/seed-training from the running app.
 *
 * Selects top 100 merchants by (count * 0.5 + spend_rank * 0.5).
 * Marks 20 as holdout = true (deterministic: fnv32(merchant) % 5 === 0).
 * Idempotent — skips merchants already in training_labels.
 */
import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local')
const envLines = fs.readFileSync(envPath, 'utf8').split('\n')
for (const line of envLines) {
  const eq = line.indexOf('=')
  if (eq > 0) {
    const key = line.slice(0, eq).trim()
    const val = line.slice(eq + 1).trim()
    if (key && !process.env[key]) process.env[key] = val
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const HOUSEHOLD_ID = '00000000-0000-0000-0000-000000000001'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

/** Deterministic FNV-32a hash for holdout selection */
function fnv32a(str: string): number {
  let hash = 2166136261
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 16777619) >>> 0
  }
  return hash
}

async function main() {
  console.log('Fetching transactions...')
  const { data: txns, error: txnErr } = await supabase
    .from('transactions')
    .select('merchant, amount, category, classification, is_transfer, date')
    .eq('household_id', HOUSEHOLD_ID)
    .order('date', { ascending: true })

  if (txnErr) {
    console.error('Failed to fetch transactions:', txnErr.message)
    process.exit(1)
  }
  if (!txns || txns.length === 0) {
    console.error('No transactions found. Check credentials and household_id.')
    process.exit(1)
  }

  console.log(`Found ${txns.length} transactions. Grouping by merchant...`)

  // Group by merchant
  type MerchantStats = {
    merchant: string
    count: number
    totalSpend: number
    categories: Record<string, number>
    classifications: Record<string, number>
    allIncome: boolean
    allTransfer: boolean
    minDate: string
    maxDate: string
  }

  const byMerchant = new Map<string, MerchantStats>()
  for (const t of txns) {
    const m = t.merchant || 'UNKNOWN'
    if (!byMerchant.has(m)) {
      byMerchant.set(m, {
        merchant: m,
        count: 0,
        totalSpend: 0,
        categories: {},
        classifications: {},
        allIncome: true,
        allTransfer: true,
        minDate: t.date,
        maxDate: t.date,
      })
    }
    const s = byMerchant.get(m)!
    s.count++
    s.totalSpend += Math.abs(t.amount)
    if (t.category) s.categories[t.category] = (s.categories[t.category] || 0) + 1
    if (t.classification) s.classifications[t.classification] = (s.classifications[t.classification] || 0) + 1
    if (t.amount <= 0) s.allIncome = false
    if (!t.is_transfer) s.allTransfer = false
    if (t.date < s.minDate) s.minDate = t.date
    if (t.date > s.maxDate) s.maxDate = t.date
  }

  const merchants = Array.from(byMerchant.values())

  // Rank by (count * 0.5 + spend_rank * 0.5)
  const sortedBySpend = [...merchants].sort((a, b) => b.totalSpend - a.totalSpend)
  const spendRankMap = new Map<string, number>()
  sortedBySpend.forEach((m, i) => spendRankMap.set(m.merchant, i))

  const maxCount = Math.max(...merchants.map(m => m.count))
  const maxSpendRank = merchants.length - 1

  const ranked = merchants.map(m => {
    const countScore = maxCount > 0 ? m.count / maxCount : 0
    const spendRankScore = maxSpendRank > 0 ? 1 - (spendRankMap.get(m.merchant)! / maxSpendRank) : 1
    return { ...m, score: countScore * 0.5 + spendRankScore * 0.5 }
  }).sort((a, b) => b.score - a.score).slice(0, 100)

  console.log(`Top ${ranked.length} merchants selected.`)

  // Get existing labels to skip
  const { data: existing } = await supabase
    .from('training_labels')
    .select('merchant')
    .eq('household_id', HOUSEHOLD_ID)
  const existingMerchants = new Set((existing || []).map(e => e.merchant))
  console.log(`${existingMerchants.size} already seeded, skipping.`)

  // Build rows to insert
  const rows = ranked
    .filter(m => !existingMerchants.has(m.merchant))
    .map(m => {
      const topCategory = Object.entries(m.categories).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      const topClassification = Object.entries(m.classifications).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      const holdout = fnv32a(m.merchant) % 5 === 0

      return {
        household_id: HOUSEHOLD_ID,
        merchant: m.merchant,
        correct_category: topCategory,
        correct_classification: topClassification,
        is_income: m.allIncome,
        is_transfer: m.allTransfer,
        is_subscription: false,
        status: 'pending',
        holdout,
        labelled_by: 'steve',
      }
    })

  if (rows.length === 0) {
    console.log('Nothing new to insert.')
    return
  }

  console.log(`Inserting ${rows.length} new label rows...`)
  const { error: insertErr } = await supabase
    .from('training_labels')
    .insert(rows)

  if (insertErr) {
    console.error('Insert error:', insertErr.message)
    process.exit(1)
  }

  const holdoutCount = rows.filter(r => r.holdout).length
  console.log(`✓ Inserted ${rows.length} labels (${holdoutCount} holdout, ${rows.length - holdoutCount} benchmark)`)
}

main().catch(e => { console.error(e); process.exit(1) })
