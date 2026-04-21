-- Ground Truth Training Labels
-- Apply this in the Supabase SQL editor at: Project → SQL Editor → New Query
-- Or run: node_modules/.bin/sucrase-node scripts/applyTrainingSchema.ts

create table if not exists training_labels (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  merchant text not null,
  correct_category text,
  correct_classification text,
  is_income boolean default false,
  is_transfer boolean default false,
  is_subscription boolean default false,
  subscription_frequency text,
  notes text,
  status text not null default 'pending',
  suggested_rule text,
  holdout boolean default false,
  labelled_at timestamptz default now(),
  labelled_by text default 'steve'
);

create index if not exists training_labels_household_merchant
  on training_labels (household_id, merchant);

create unique index if not exists training_labels_household_merchant_unique
  on training_labels (household_id, merchant);
