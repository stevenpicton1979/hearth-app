-- Migration: add xero_connections table for OAuth token storage
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

create table xero_connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references accounts(household_id) on delete cascade,
  tenant_id text not null,
  tenant_name text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(household_id, tenant_id)
);

-- No RLS needed (similar to training_labels, manual_income_entries)
alter table xero_connections disable row level security;
