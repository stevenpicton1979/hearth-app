-- Migration: add Xero sync count columns to accounts table
-- Run this in the Supabase dashboard SQL editor before deploying the
-- accompanying code changes (sync route Phase 3b + reconcile route update).
--
-- https://supabase.com/dashboard/project/_/sql

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS last_xero_sync_count  INTEGER,
  ADD COLUMN IF NOT EXISTS last_xero_synced_at   TIMESTAMPTZ;
