-- Migration 011: account_suffix + needs_review
-- Run in Supabase SQL editor for project npydbobvppfqdoiyiuar

-- Add account_suffix to accounts table.
-- Stores the suffix as it appears in Xero narrations, e.g. "XX5426" for
-- Bills & Direct Debits, or "1234" (last 4 digits) for business cards.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS account_suffix TEXT;

-- Index for suffix lookups during Xero sync
CREATE INDEX IF NOT EXISTS idx_accounts_suffix
  ON accounts (household_id, account_suffix)
  WHERE account_suffix IS NOT NULL;

-- Add needs_review flag to transactions.
-- Set to true by the Xero sync when a SPEND-TRANSFER destination suffix is
-- found in the narration but does not match any known Hearth account.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false;

-- Index for the Needs Review tab query
CREATE INDEX IF NOT EXISTS idx_transactions_needs_review
  ON transactions (household_id, needs_review)
  WHERE needs_review = true;
