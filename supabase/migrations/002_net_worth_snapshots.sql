create table if not exists net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) not null,
  total_assets numeric(14,2) not null,
  total_liabilities numeric(14,2) not null,
  net_worth numeric(14,2) not null,
  recorded_at timestamptz default now()
);
create index if not exists idx_snapshots_household_id on net_worth_snapshots(household_id);
alter table net_worth_snapshots enable row level security;

-- Run this in Supabase SQL Editor
