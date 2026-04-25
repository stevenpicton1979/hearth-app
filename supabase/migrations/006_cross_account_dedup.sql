-- Bulk backfill raw_description: single UPDATE...FROM instead of N individual queries
CREATE OR REPLACE FUNCTION bulk_backfill_raw_description(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE transactions t
  SET raw_description = v.raw_description
  FROM (
    SELECT
      (elem->>'account_id')::uuid AS account_id,
      (elem->>'date')::date       AS date,
      (elem->>'amount')::numeric  AS amount,
      elem->>'description'        AS description,
      elem->>'raw_description'    AS raw_description
    FROM jsonb_array_elements(p_rows) AS elem
  ) v
  WHERE t.account_id = v.account_id
    AND t.date       = v.date
    AND t.amount     = v.amount
    AND t.description = v.description
    AND t.raw_description IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Cross-account dedup: self-join Xero vs CSV rows in a single round-trip
-- Returns the number of CSV rows flagged as transfers
CREATE OR REPLACE FUNCTION cross_account_dedup(
  p_xero_account_id uuid,
  p_household_id    uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_csv_count integer;
BEGIN
  -- Flag CSV rows that match a Xero row
  WITH matches AS (
    SELECT DISTINCT ON (csv.id)
      csv.id             AS csv_id,
      csv.raw_description AS csv_raw
    FROM transactions csv
    JOIN transactions xero
      ON  xero.account_id   = p_xero_account_id
      AND xero.household_id = p_household_id
      AND xero.date         = csv.date
      AND xero.amount       = csv.amount
      AND xero.merchant     = csv.merchant
      AND xero.is_transfer  = false
      AND (xero.raw_description IS NULL OR xero.raw_description NOT LIKE '%[dup:csv]%')
    WHERE csv.household_id = p_household_id
      AND csv.source       IS NULL
      AND csv.account_id   != p_xero_account_id
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
      AND csv.account_id   != p_xero_account_id
      AND csv.is_transfer  = false
      AND csv.date         = xero.date
      AND csv.amount       = xero.amount
      AND csv.merchant     = xero.merchant
    WHERE xero.account_id   = p_xero_account_id
      AND xero.household_id = p_household_id
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
