-- Data migration: seed subscriptions + subscription_merchants from existing data.
-- Run AFTER addSubscriptionsTables.sql and BEFORE deploying new app code.
-- subscription_metadata is NOT dropped — kept as deprecated for one release.
--
-- Idempotent: uses NOT EXISTS guards so re-running is safe.

DO $$
BEGIN

  -- One subscription row per confirmed merchant in merchant_mappings.
  -- Initial name = the merchant string; user can rename via the UI.
  -- Metadata is copied from subscription_metadata where it exists.
  INSERT INTO subscriptions (
    household_id, name, cancellation_url, account_email,
    notes, auto_renews, next_renewal_override, category
  )
  SELECT
    mm.household_id,
    mm.merchant              AS name,
    sm.cancellation_url,
    sm.account_email,
    sm.notes,
    COALESCE(sm.auto_renews, TRUE),
    sm.next_renewal_override,
    sm.category
  FROM merchant_mappings mm
  LEFT JOIN subscription_metadata sm
    ON sm.merchant = mm.merchant AND sm.household_id = mm.household_id
  WHERE mm.classification = 'Subscription'
    AND NOT EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.household_id = mm.household_id AND s.name = mm.merchant
    );

  -- Link each newly-created subscription back to its single source merchant.
  INSERT INTO subscription_merchants (subscription_id, merchant, household_id)
  SELECT s.id, s.name, s.household_id
  FROM subscriptions s
  WHERE NOT EXISTS (
    SELECT 1 FROM subscription_merchants sm WHERE sm.subscription_id = s.id
  )
  ON CONFLICT DO NOTHING;

END $$;

-- Verification queries (run manually to confirm):
-- SELECT COUNT(*) FROM subscriptions;                                      -- should match confirmed merchant count
-- SELECT COUNT(*) FROM subscription_merchants;                             -- should equal subscriptions count
-- SELECT mm.merchant FROM merchant_mappings mm WHERE mm.classification = 'Subscription'
--   AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.name = mm.merchant AND s.household_id = mm.household_id);
--   -- should return 0 rows
