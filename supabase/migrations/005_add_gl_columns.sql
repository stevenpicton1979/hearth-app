-- Add GL account and tax columns captured from Xero line items.
-- gl_account: display name of the counter GL account (e.g. "2015 Directors Loan"). NULL for CSV imports.
-- gl_tax_type: Xero TaxType code from the first line item (e.g. "GST", "EXEMPTEXPENSES", "BASEXCLUDED"). NULL for CSV imports.
-- Renamed from the working name gl_tax_rate because Xero stores this as a string code, not a numeric rate.

alter table transactions
  add column if not exists gl_account  text,
  add column if not exists gl_tax_type text;
