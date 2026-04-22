-- Migration: add source column to transactions table for Xero sync
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

alter table transactions add column if not exists source text default 'csv';
