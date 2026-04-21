/**
 * Applies the training_labels migration to the Supabase database.
 *
 * Usage:
 *   node_modules/.bin/sucrase-node scripts/applyTrainingSchema.ts
 *
 * Alternatively, paste scripts/migrate_training_labels.sql directly into the
 * Supabase SQL editor at: Project → SQL Editor → New Query.
 *
 * This script was run on: 2026-04-21 (initial table creation)
 */
import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

// Load .env.local without dotenv
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
  const sql = fs.readFileSync(path.join(__dirname, 'migrate_training_labels.sql'), 'utf8')
  // Split on semicolons to run each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  for (const stmt of statements) {
    const { error } = await supabase.rpc('exec_sql', { sql: stmt }).single()
    if (error) {
      // Try direct query via REST — Supabase doesn't expose exec_sql by default
      // Fall back: print instructions
      console.error('Could not run via RPC. Please paste migrate_training_labels.sql into the Supabase SQL editor.')
      console.error('Error:', error.message)
      process.exit(1)
    }
    console.log('✓', stmt.slice(0, 60))
  }
  console.log('\nMigration complete.')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
