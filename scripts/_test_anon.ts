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

// Try anon key
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function main() {
  const { data, error } = await supabase.from('training_labels').select('id').limit(1)
  if (error) console.log('training_labels:', error.message)
  else console.log('training_labels:', data?.length, 'rows')
  
  const { count, error: e2 } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
  if (e2) console.log('transactions error:', e2.message)
  else console.log('transactions count:', count)
}
main().catch(console.error)
