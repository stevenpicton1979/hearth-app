-- Migration 013: Clean up stale RECEIVE-TRANSFER rows
-- Before this fix, Xero RECEIVE-TRANSFER transactions were stored as is_transfer=false,
-- causing them to appear as income (e.g. "Director Income") in the transactions view.
-- The Xero sync now skips RECEIVE-TRANSFER entirely, but old rows remain in the DB.
-- This migration hides them by setting is_transfer=true so they are excluded from reports.
--
-- Run once in the Supabase SQL editor for project npydbobvppfqdoiyiuar.

-- 1. Preview — confirm these are the rows to hide
SELECT t.id, t.date, t.amount, t.merchant, t.category, a.display_name
FROM transactions t
JOIN accounts a ON t.account_id = a.id
WHERE a.institution = 'Xero'
  AND t.amount > 0
  AND t.merchant ILIKE 'BANK TRANSFER FROM %'
  AND t.is_transfer = false
ORDER BY t.date DESC;

-- 2. Apply (uncomment after confirming preview)
-- UPDATE transactions t
-- SET is_transfer = true
-- FROM accounts a
-- WHERE t.account_id = a.id
--   AND a.institution = 'Xero'
--   AND t.amount > 0
--   AND t.merchant ILIKE 'BANK TRANSFER FROM %'
--   AND t.is_transfer = false;
