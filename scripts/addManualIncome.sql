-- Migration: create manual_income_entries table
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/_/sql
CREATE TABLE IF NOT EXISTS manual_income_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  date date NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  description text NOT NULL,
  category text NOT NULL DEFAULT 'Director Income',
  recipient text,
  financial_year text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manual_income_entries_household_date
  ON manual_income_entries(household_id, date);
