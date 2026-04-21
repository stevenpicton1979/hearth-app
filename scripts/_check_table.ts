import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data, error } = await supabase.from('training_labels').select('id').limit(1)
  if (error) console.log('training_labels missing:', error.message)
  else console.log('training_labels EXISTS, rows so far:', data?.length ?? 0)

  const { data: hh } = await supabase.from('households').select('id').limit(1)
  console.log('household_id:', hh?.[0]?.id)

  const { count } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', '00000000-0000-0000-0000-000000000001')
  console.log('transaction count:', count)
}

main().catch(e => { console.error(e); process.exit(1) })
