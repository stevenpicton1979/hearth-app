-- Migration: subscriptions + subscription_merchants tables
-- Run in Supabase SQL editor BEFORE the data migration and BEFORE deploying.
-- Uses IF NOT EXISTS so it is safe to re-run.

CREATE TABLE IF NOT EXISTS subscriptions (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         UUID          NOT NULL,
  name                 TEXT          NOT NULL,
  cancellation_url     TEXT,
  account_email        TEXT,
  notes                TEXT,
  auto_renews          BOOLEAN       NOT NULL DEFAULT TRUE,
  next_renewal_override DATE,
  category             TEXT,
  is_active            BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_household_active
  ON subscriptions (household_id, is_active);

CREATE TABLE IF NOT EXISTS subscription_merchants (
  subscription_id UUID    NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  merchant        TEXT    NOT NULL,
  household_id    UUID    NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (subscription_id, merchant)
);

CREATE INDEX IF NOT EXISTS idx_subscription_merchants_lookup
  ON subscription_merchants (household_id, merchant);

-- One active subscription per merchant string per household.
-- Dismissed subscriptions have their merchant links removed on soft-delete,
-- so this index only blocks active duplicates in practice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_merchants_unique
  ON subscription_merchants (household_id, merchant);
