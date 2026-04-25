-- Add owner column to accounts.
-- Values: Steven | Nicola | Joint | Business | NULL (unset)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS owner text;

-- Default values for known accounts
UPDATE accounts SET owner = 'Joint'
  WHERE household_id = '00000000-0000-0000-0000-000000000001'
    AND display_name = 'Bills & Direct Debits';

UPDATE accounts SET owner = 'Nicola'
  WHERE household_id = '00000000-0000-0000-0000-000000000001'
    AND display_name = 'Nicola''s Account';

UPDATE accounts SET owner = 'Joint'
  WHERE household_id = '00000000-0000-0000-0000-000000000001'
    AND display_name = 'Smart Awards';

UPDATE accounts SET owner = 'Business'
  WHERE household_id = '00000000-0000-0000-0000-000000000001'
    AND display_name = 'Brisbane Health Tech';

UPDATE accounts SET owner = 'Business'
  WHERE household_id = '00000000-0000-0000-0000-000000000001'
    AND display_name = 'Mastercard Bus. Plat';

UPDATE accounts SET owner = 'Business'
  WHERE household_id = '00000000-0000-0000-0000-000000000001'
    AND display_name = 'BHT NAB CC';

UPDATE accounts SET owner = 'Business'
  WHERE household_id = '00000000-0000-0000-0000-000000000001'
    AND display_name = 'American Express Velocity Business Card';
