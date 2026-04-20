create table if not exists category_prefs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) not null,
  category text not null,
  is_hidden boolean default false,
  display_name text,
  updated_at timestamptz default now(),
  unique(household_id, category)
);
alter table category_prefs enable row level security;

alter table accounts add column if not exists current_balance numeric(14,2);

alter table goals add column if not exists linked_account_id uuid references accounts(id);

-- Run this in Supabase SQL Editor
