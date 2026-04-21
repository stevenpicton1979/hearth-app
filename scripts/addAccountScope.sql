-- Migration: add scope column to accounts
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/_/sql
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'household'
  CHECK (scope IN ('household', 'business', 'investment'));
