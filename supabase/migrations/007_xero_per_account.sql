-- Add xero_account_id to accounts so Xero bank accounts are keyed by their
-- stable Xero UUID rather than their display name.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS xero_account_id text;

-- Unique index: one Hearth account per Xero bank account per household.
-- Partial (WHERE NOT NULL) so non-Xero accounts are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS accounts_household_xero_account_id_unique
  ON accounts (household_id, xero_account_id)
  WHERE xero_account_id IS NOT NULL;

-- ----------------------------------------------------------------
-- Data cleanup: wipe all existing Xero transactions and accounts.
-- The new per-bank-account sync will re-import everything cleanly.
-- Run a Full Re-sync from the Xero settings page after this migration.
-- ----------------------------------------------------------------
DELETE FROM transactions
WHERE account_id IN (
  SELECT id FROM accounts
  WHERE household_id = '00000000-0000-0000-0000-000000000001'
    AND institution = 'Xero'
);

DELETE FROM accounts
WHERE household_id = '00000000-0000-0000-0000-000000000001'
  AND institution = 'Xero';

-- ----------------------------------------------------------------
-- Replace cross_account_dedup: old signature took a specific Xero
-- account UUID; new signature takes only household_id and matches
-- on source = 'xero' — works regardless of how many Xero accounts exist.
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS cross_account_dedup(uuid, uuid);

CREATE OR REPLACE FUNCTION cross_account_dedup(p_household_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_csv_count integer;
BEGIN
  -- Flag CSV rows that match a Xero row (same date / amount / merchant)
  WITH matches AS (
    SELECT DISTINCT ON (csv.id)
      csv.id              AS csv_id,
      csv.raw_description AS csv_raw
    FROM transactions csv
    JOIN transactions xero
      ON  xero.household_id = p_household_id
      AND xero.source       = 'xero'
      AND xero.date         = csv.date
      AND xero.amount       = csv.amount
      AND xero.merchant     = csv.merchant
      AND xero.is_transfer  = false
      AND (xero.raw_description IS NULL OR xero.raw_description NOT LIKE '%[dup:csv]%')
    WHERE csv.household_id = p_household_id
      AND csv.source       IS NULL
      AND csv.is_transfer  = false
      AND (csv.raw_description IS NULL OR csv.raw_description NOT LIKE '%[dup:xero]%')
  )
  UPDATE transactions t
  SET
    is_transfer     = true,
    raw_description = CASE
      WHEN m.csv_raw IS NOT NULL AND m.csv_raw != ''
        THEN m.csv_raw || ' [dup:xero]'
      ELSE '[dup:xero]'
    END
  FROM matches m
  WHERE t.id = m.csv_id;

  GET DIAGNOSTICS v_csv_count = ROW_COUNT;

  -- Flag Xero rows that match a CSV row
  WITH matches AS (
    SELECT DISTINCT ON (xero.id)
      xero.id              AS xero_id,
      xero.raw_description AS xero_raw
    FROM transactions xero
    JOIN transactions csv
      ON  csv.household_id = p_household_id
      AND csv.source       IS NULL
      AND csv.is_transfer  = false
      AND csv.date         = xero.date
      AND csv.amount       = xero.amount
      AND csv.merchant     = xero.merchant
    WHERE xero.household_id = p_household_id
      AND xero.source       = 'xero'
      AND xero.is_transfer  = false
      AND (xero.raw_description IS NULL OR xero.raw_description NOT LIKE '%[dup:csv]%')
  )
  UPDATE transactions t
  SET
    is_transfer     = true,
    raw_description = CASE
      WHEN m.xero_raw IS NOT NULL AND m.xero_raw != ''
        THEN m.xero_raw || ' [dup:csv]'
      ELSE '[dup:csv]'
    END
  FROM matches m
  WHERE t.id = m.xero_id;

  RETURN v_csv_count;
END;
$$;
