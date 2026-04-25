-- Migration 012: Backfill Salary category
-- Updates existing CBA transactions that were categorised as "Director Income"
-- but whose description contains the word "wage" (case-insensitive).
-- These are PAYG wage payments and should be categorised as "Salary" instead.
--
-- Run this ONCE in the Supabase SQL editor for project npydbobvppfqdoiyiuar.
-- After running, trigger a Full Re-sync from Settings → Xero so that new
-- SPEND-TRANSFER transactions are classified by the rule engine going forward.

-- 1. Preview (run first to confirm the rows look right)
SELECT id, date, amount, description, merchant, category, account_id
FROM transactions
WHERE category = 'Director Income'
  AND description ILIKE '%wage%'
ORDER BY date DESC;

-- 2. Apply the backfill (uncomment and run after confirming the preview)
-- UPDATE transactions
-- SET category = 'Salary'
-- WHERE category = 'Director Income'
--   AND description ILIKE '%wage%';
