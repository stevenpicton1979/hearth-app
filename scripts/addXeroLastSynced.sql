-- Migration: add last_synced_at to xero_connections for incremental sync
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/_/sql
ALTER TABLE xero_connections
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
