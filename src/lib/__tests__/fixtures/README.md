# Coverage regression fixtures

## What

`coverageMerchants.json` — a snapshot of distinct merchant strings from production,
each tagged with whether it represents an income or expense transaction. Used by
`coverageRegression.test.ts` to assert that the rule pipeline correctly classifies
real production data.

## Why

Unit tests in `merchantCategoryRules.test.ts` validate rule logic against synthetic
input strings. They do NOT validate against the actual merchant strings present in
the database. A rule like `/^hanaichi pty ltd$/i` could pass its unit test while
failing on production where the real string is `HANAICHI PTY LTD BRISBANE CIT`.

The coverage regression test closes this gap by running the pipeline against a
snapshot of real strings.

## How to regenerate

Run the SQL below in Supabase (or wherever you query production), save the output
as JSON, and replace `coverageMerchants.json`:

```sql
SELECT
  merchant,
  -- Treat the merchant as income if it has any income transaction. Tighten if
  -- needed; some merchants (e.g. Medibank) appear on both sides.
  bool_or(amount > 0) AS is_income,
  COUNT(*) AS count,
  SUM(ABS(amount)) AS total_amount
FROM transactions
WHERE source = 'csv'
  AND is_transfer = false
  AND merchant IS NOT NULL
GROUP BY merchant
ORDER BY total_amount DESC;
```

Then map each row into `{ merchant, isIncome, count, totalAmount }` and stick the
array under `"merchants"` in the JSON file.

A small generator helper lives at `scripts/generateCoverageFixture.ts` if you want
to automate this — needs Supabase env vars set.

## When to update EXPECTED_UNMATCHED

If you add a new merchant rule, the regression test should turn green automatically
(one fewer entry in unmatched). If you intentionally choose NOT to write a rule
for a merchant (e.g. it's a one-off unique payee), add it to `EXPECTED_UNMATCHED`
in `coverageRegression.test.ts` with a comment explaining why.
