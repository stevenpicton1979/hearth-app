-- Rename owner classification values: Personal → Steven
-- Business, Joint remain unchanged; Nicola is a new value assigned going forward.

UPDATE transactions
SET classification = 'Steven'
WHERE classification = 'Personal';

-- Mirror the rename on merchant_mappings so future syncs inherit the correct value
UPDATE merchant_mappings
SET classification = 'Steven'
WHERE classification = 'Personal';
