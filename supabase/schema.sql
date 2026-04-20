-- Households (one per family/couple)
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- Users (Phase 2 — stub for now)
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id),
  email text unique,
  display_name text,
  created_at timestamptz default now()
);

-- Bank accounts (connected via Basiq or entered manually)
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) not null,
  display_name text not null,
  institution text,
  account_type text, -- 'transaction', 'savings', 'credit', 'mortgage', 'investment', 'super', 'property'
  basiq_account_id text unique,
  last_synced_at timestamptz,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Transactions
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) not null,
  account_id uuid references accounts(id) not null,
  date date not null,
  amount numeric(12,2) not null,
  description text not null,
  merchant text not null,
  category text,
  classification text,
  notes text,
  is_transfer boolean default false,
  basiq_transaction_id text unique,
  created_at timestamptz default now(),
  unique(account_id, date, amount, description)
);

-- Merchant category mappings (persistent rules)
create table if not exists merchant_mappings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) not null,
  merchant text not null,
  category text,
  classification text,
  notes text,
  updated_at timestamptz default now(),
  unique(household_id, merchant)
);

-- Net worth entries (property, super, investments — manual)
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) not null,
  name text not null,
  asset_type text not null, -- 'property', 'super', 'shares', 'cash', 'other'
  value numeric(14,2) not null,
  notes text,
  as_at date not null default current_date,
  updated_at timestamptz default now()
);

-- Liabilities (mortgage, loans — manual or from Basiq)
create table if not exists liabilities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) not null,
  name text not null,
  liability_type text not null, -- 'mortgage', 'personal_loan', 'car_loan', 'credit_card', 'bnpl', 'other'
  balance numeric(14,2) not null,
  as_at date not null default current_date,
  updated_at timestamptz default now()
);

-- Savings goals
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) not null,
  name text not null,
  target_amount numeric(12,2) not null,
  current_amount numeric(12,2) default 0,
  target_date date,
  is_complete boolean default false,
  emoji text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Budget targets (per category per month)
create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) not null,
  category text not null,
  monthly_limit numeric(10,2) not null,
  updated_at timestamptz default now(),
  unique(household_id, category)
);

-- Indexes
create index if not exists idx_transactions_household_id on transactions(household_id);
create index if not exists idx_transactions_date on transactions(date);
create index if not exists idx_transactions_merchant on transactions(merchant);
create index if not exists idx_transactions_category on transactions(category);
create index if not exists idx_accounts_household_id on accounts(household_id);
create index if not exists idx_merchant_mappings_household_id on merchant_mappings(household_id);
create index if not exists idx_assets_household_id on assets(household_id);
create index if not exists idx_liabilities_household_id on liabilities(household_id);
create index if not exists idx_goals_household_id on goals(household_id);

-- Enable RLS on all tables (policies added in Phase 2)
alter table households enable row level security;
alter table users enable row level security;
alter table accounts enable row level security;
alter table transactions enable row level security;
alter table merchant_mappings enable row level security;
alter table assets enable row level security;
alter table liabilities enable row level security;
alter table goals enable row level security;
alter table budgets enable row level security;

-- Seed default household for Phase 1
insert into households (id, name) values
  ('00000000-0000-0000-0000-000000000001', 'My Household')
on conflict (id) do nothing;
