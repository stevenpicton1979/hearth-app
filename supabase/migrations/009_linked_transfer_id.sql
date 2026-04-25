-- Add linked_transfer_id column so transfer pairs reference each other directly.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS linked_transfer_id uuid
    REFERENCES transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_linked_transfer_id
  ON transactions(linked_transfer_id)
  WHERE linked_transfer_id IS NOT NULL;

-- Backfill: link existing transfer pairs (same household, same date,
-- amount + other_amount = 0, different accounts, at least one is_transfer).
-- Two-step to avoid "row updated twice" within a single statement.

-- Step 1: for the lower-id row in each pair, set linked_transfer_id to
-- its counterpart. DISTINCT ON ensures each a gets at most one b.
WITH pairs AS (
  SELECT DISTINCT ON (a.id)
    a.id AS a_id,
    b.id AS b_id
  FROM transactions a
  JOIN transactions b
    ON  a.household_id = b.household_id
    AND a.date         = b.date
    AND ROUND((a.amount + b.amount)::numeric, 4) = 0
    AND a.account_id  != b.account_id
    AND a.id           < b.id
    AND (a.is_transfer = true OR b.is_transfer = true)
    AND a.linked_transfer_id IS NULL
    AND b.linked_transfer_id IS NULL
  ORDER BY a.id, b.id  -- deterministic: smallest b wins
)
UPDATE transactions t
SET linked_transfer_id = p.b_id
FROM pairs p
WHERE t.id = p.a_id;

-- Step 2: for every b that step 1 just pointed an a at, link b → a.
UPDATE transactions b
SET linked_transfer_id = a.id
FROM transactions a
WHERE a.linked_transfer_id = b.id
  AND b.linked_transfer_id IS NULL;
