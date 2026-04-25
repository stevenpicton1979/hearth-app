-- Migration: clean up stale transfer links
-- Background: transferLinker.ts was fixed to require BOTH sides of a transfer
-- pair to have is_transfer=true. This removes false links written by the old logic.
-- Run in Supabase SQL editor:
-- https://supabase.com/dashboard/project/npydbobvppfqdoiyiuar/sql

-- Step 1: Clear links on rows that are not themselves flagged as transfers
UPDATE transactions
SET linked_transfer_id = NULL
WHERE linked_transfer_id IS NOT NULL
  AND is_transfer = false;

-- Step 2: Clear links where the counterpart is not flagged as a transfer
UPDATE transactions
SET linked_transfer_id = NULL
WHERE linked_transfer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM transactions t2
    WHERE t2.id = transactions.linked_transfer_id
      AND t2.is_transfer = true
  );
