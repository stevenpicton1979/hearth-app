-- MIGRATION: cancelled subscription lifecycle
-- Run in Supabase SQL editor before deploying.
--
-- Adds cancelled_at (DATE) and auto_cancelled (BOOLEAN) to subscriptions.
-- Backfills existing is_active=false rows so they appear in the Cancelled tab.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cancelled_at DATE,
  ADD COLUMN IF NOT EXISTS auto_cancelled BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: existing dismissed rows get cancelled_at = their updated_at date
-- so they appear correctly in the new Cancelled tab.
UPDATE subscriptions
SET cancelled_at = updated_at::date
WHERE is_active = false AND cancelled_at IS NULL;
