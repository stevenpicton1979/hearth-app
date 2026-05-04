-- Migration: Director Drawings / Position Widget foundation
-- Run once against the Supabase database.
-- All columns are additive — safe to run on a live database.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_provisional  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS linked_gl_account TEXT,
  ADD COLUMN IF NOT EXISTS contact_name      TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_is_provisional
  ON transactions (household_id, is_provisional)
  WHERE is_provisional = TRUE;

CREATE INDEX IF NOT EXISTS idx_transactions_linked_gl_account
  ON transactions (household_id, linked_gl_account)
  WHERE linked_gl_account IS NOT NULL;
