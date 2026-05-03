-- Migration: subscription_metadata table
-- Run once in the Supabase dashboard SQL editor before deploying.
-- Uses IF NOT EXISTS so it is safe to run again.

CREATE TABLE IF NOT EXISTS subscription_metadata (
  merchant               TEXT          NOT NULL,
  household_id           UUID          NOT NULL,
  cancellation_url       TEXT,
  account_email          TEXT,
  notes                  TEXT,
  auto_renews            BOOLEAN       NOT NULL DEFAULT TRUE,
  next_renewal_override  DATE,
  category               TEXT,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant, household_id)
);
