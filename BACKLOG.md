# Hearth — Overnight Build Backlog

Run these tasks in order. Each must pass `npm test` (297 tests) before moving to the next.
Commit after each task. Vercel auto-deploys on push to main.

---

## [x] 1. Remove debug endpoint
Delete `src/app/api/xero/debug/route.ts` — this was a temporary debugging endpoint left in from the Xero data quality session. It returns raw Xero transaction data and should not be in production.

---

## [x] 2. Fix .gitattributes (CRLF warnings)
Create `.gitattributes` at the repo root:
```
* text=auto eol=lf
*.ts text eol=lf
*.tsx text eol=lf
*.json text eol=lf
*.md text eol=lf
```
This stops LF/CRLF warnings on every commit from Windows.

---

## [x] 3. Add /mappings to sidebar navigation
The `/mappings` page (merchant mappings admin) is only reachable via Settings. Add it to the sidebar nav so it's always accessible. Look at where the sidebar nav links are defined (likely a nav component or layout) and add a "Mappings" entry with an appropriate icon (e.g. a tag or list icon).

---

## [x] 4. Subscriptions UI — Confirm and Dismiss per row
In `/subscriptions`, each detected subscription row needs two actions:
- **Confirm** — marks it as a confirmed subscription (store in merchant_mappings with classification='Subscription' or a flag)
- **Dismiss** — removes it from the subscriptions view permanently by writing `classification='Not a subscription'` to merchant_mappings for that merchant

The dismiss action should create a merchant_mappings row if one doesn't exist, or update the existing one. Dismissed subscriptions should not reappear. Add the UI buttons inline on each subscription row in the Active and All tabs.

---

## [x] 5. Xero — Full re-sync button
In `/settings/xero`, add a "Full re-sync" button alongside the existing "Sync Now" button.

When clicked:
1. Call a new API endpoint `POST /api/xero/full-resync` (or extend the existing sync route with a `?full=true` param)
2. The endpoint should: NULL out `last_synced_at` in xero_connections for this household, then call the same sync logic as the normal sync
3. Show appropriate loading/confirmation UI

This saves having to manually run SQL in Supabase when a full re-sync is needed.

---

## [x] 6. Inline edit for Income Entries
In `/settings/income-entries`, the current UI only supports add + delete. Add inline editing:
- Each row should have an Edit button that expands the row into an editable form (or shows a modal)
- Fields: date, amount, description, category, recipient, financial_year
- On save: `PUT /api/manual-income` (add this endpoint) updates the existing row
- On cancel: reverts to read-only view
- Keep the existing delete behaviour

---

## [x] 7. Training card — show example transaction descriptions
In `/dev/training`, each merchant card currently shows: merchant name, transaction count, total amount, date range, account. This isn't enough info to confidently classify some merchants (e.g. "D E", "ATO → BRISBANE HEALTH TECH").

Add a section to each card showing 2–3 example raw `description` values from the transactions table for that merchant. Query via a new endpoint `GET /api/dev/merchant-examples?merchant=X` that returns up to 3 distinct description strings for that merchant. Display them in the card as small grey text under the existing metadata, labelled "Examples:".

---

## [x] 8. Add `raw_description` column to transactions — store unprocessed Xero context

**Problem:** For Xero transactions, `cleanXeroMerchant` picks the best single string and discards the rest. When the contact name is just initials (e.g. "D E") there's nothing more to show in the training UI or transaction list.

**Solution:**
1. Add a `raw_description` TEXT column to the transactions table (nullable). Run this migration in Supabase (save as `scripts/addRawDescription.sql`):
   ```sql
   ALTER TABLE transactions ADD COLUMN IF NOT EXISTS raw_description TEXT;
   ```
2. In `src/app/api/xero/sync/route.ts`, when building each transaction, compose a raw_description string from all available Xero fields:
   `"ContactName | Reference | Narration | LineItem[0].Description"` — include only non-empty fields, pipe-separated, max 300 chars.
3. In `categoryPipeline.ts` / `upsertTransactions`, pass `raw_description` through to the upsert (it's an extra column, no unique constraint involvement).
4. For CSV transactions, `raw_description` can store the original unprocessed bank description string (before cleanMerchant runs) — update `src/app/api/import/route.ts` to capture this.
5. In `/dev/training`, update the `merchant-examples` endpoint to return `raw_description` instead of (or in addition to) `description`. Display it in the card under "Examples:".
6. In `/transactions`, show `raw_description` as a tooltip or expandable detail on each transaction row.

After deploying: run a Full Re-sync from Settings → Xero to repopulate Xero transactions with raw_description. CSV transactions will get raw_description on next re-import.

Add tests for the raw_description composition logic.

---

## [x] 9. Training card — Skip/Defer button

**Problem:** Some merchants can't be confidently classified without looking them up externally (e.g. "D E" with only initials as context). Guessing wrong pollutes the ground truth dataset.

**Solution:** Add a "Skip" button to each pending training card. When clicked:
- Sets the card's local status to 'skipped' (client-side only, not persisted — just hides it from the current session)
- The merchant remains as `status: 'pending'` in the DB
- Skipped cards reappear on next page load (so they're not permanently dismissed, just deferred)
- Show a small count of skipped cards in the session: "3 skipped this session"

This is purely a UI change — no API or DB changes needed.

---

---

## [ ] 10. Xero data reconciliation report

**Problem:** There's no way to verify that the DB contains exactly what Xero contains — no check for truncation, gaps, or duplicates.

**Solution:** Build a `GET /api/admin/reconcile` endpoint and a `/dev/reconcile` UI page.

**Endpoint logic:**
1. For each known Xero account, call the Xero API to get the total count of bank transactions (no paging, just the count header or a `$top=1` with total count). Compare to `SELECT COUNT(*) FROM transactions WHERE account_id = ?`.
2. Check for Xero duplicate rows in the DB: `SELECT external_id, COUNT(*) FROM transactions WHERE external_id IS NOT NULL GROUP BY external_id HAVING COUNT(*) > 1`. Any result is a bug.
3. Check for CSV near-duplicates: `SELECT merchant, amount, date, COUNT(*) FROM transactions WHERE source = 'csv' AND external_id IS NULL GROUP BY merchant, amount, date HAVING COUNT(*) > 1`. Return as a list of suspect rows.
4. Check date coverage per account: return `MIN(date)`, `MAX(date)`, and a flag if there are any calendar months in the range with zero transactions (suspicious gap).

**Page `/dev/reconcile`:** Simple table — one row per account. Columns: account name, Xero count, DB count, match (✓/✗), gap months, duplicate count. Green row = clean, red = problem. Add a "Re-run" button that calls the endpoint again.

**Tests:** Extract all reconciliation logic into pure functions in a separate module (e.g. `src/lib/reconcile.ts`) so it can be tested without hitting the DB or Xero API. Then test:
- `detectGapMonths(dates: Date[]): string[]` — given a list of transaction dates, returns any calendar months in the min–max range with zero transactions. Test: full coverage (no gaps), one gap in the middle, gap at the edges, single transaction.
- `compareAccountCounts(xeroCount: number, dbCount: number)` — returns match status and delta. Test: equal, DB short, DB over.
- `detectExternalIdDuplicates(rows: {external_id: string}[])` — returns any external_ids appearing more than once. Test: clean list, one dupe, multiple dupes.
- `detectCsvNearDuplicates(rows: {merchant,amount,date}[])` — returns suspect groups. Test: clean, one near-dupe pair, three-way collision.
- The API route itself: integration test with mocked Supabase and mocked Xero client, asserting the response shape for a clean account and a mismatched account.

---

## [ ] 11. Expand rule output to a full classification fingerprint

**Problem:** `MerchantCategoryRule` only outputs `category` and `isTransfer`. But the training labels have five dimensions: category, owner, isIncome, isTransfer, isSubscription. Rules can't express "this is Nicola's income" or "this is a subscription" — those fields exist in training but nowhere in the rules engine. This means training mismatches can never be fully resolved by rules alone.

Additionally, `RuleContext` has unused fields (`amount`, `accountScope`, `accountOwner`) that add noise without being used by any current rule.

**Solution:**

1. **Expand `RuleResult`** to include all five output dimensions:
   ```typescript
   export interface RuleResult {
     ruleName: string
     category: string | null
     isIncome: boolean | null      // null = "derive from transaction sign, don't override"
     isTransfer: boolean
     isSubscription: boolean
     owner: 'Steven' | 'Nicola' | 'Joint' | 'Business' | null  // null = "don't set"
   }
   ```

2. **Update `MerchantCategoryRule`** to require all five output fields (with sensible defaults so existing rules don't all break at once — `isIncome: null`, `isSubscription: false`, `owner: null`).

3. **Update `RuleContext`** — remove `amount` and `accountScope` which are currently unused by every rule. Keep `isIncome`, `glAccount`, `accountOwner` (even though `accountOwner` is currently unused, it may be needed for future owner-specific rules). Add a comment marking which fields are actually used.

4. **Update all existing rules** in `MERCHANT_CATEGORY_RULES` to explicitly specify their full fingerprint. Important nuances:
   - Rules that already match on `ctx.isIncome` (e.g. `oncore_income`, `invoice_income`, `crosslateral_income`, `director_loan_repayment`) **must** output `isIncome: true` or `isIncome: false` explicitly — not `null` — because they already know the direction by construction.
   - Rules that are direction-agnostic (e.g. `ato_payments` — could be a payment or a refund; `airbnb` — could be a charge or a refund) should use `isIncome: null` meaning "inherit from transaction amount sign".
   - `isIncome: true` + `owner` together is what powers downstream queries like "how much did Nicola earn this month" or "what was BHT revenue in Q2". Without both fields set explicitly, those aggregations are unreliable.
   - Example fingerprints:
     - `oncore_income`: `{ category: 'Business', isIncome: true, isTransfer: false, isSubscription: false, owner: 'Business' }`
     - `bht_directors_loan_transfer`: `{ category: null, isIncome: null, isTransfer: true, isSubscription: false, owner: null }`
     - `ato_payments`: `{ category: 'Government & Tax', isIncome: null, isTransfer: false, isSubscription: false, owner: null }`

5. **Add a fingerprint collision test** in the test file: assert that no two rules in `MERCHANT_CATEGORY_RULES` produce an identical output fingerprint `(category, isIncome, isTransfer, isSubscription, owner)`. A collision means either: (a) the two rules should be merged into one, or (b) the fingerprint needs a new discriminating dimension — likely a more specific category or a different owner. Do not resolve collisions by adding workaround logic; fix the taxonomy instead (see Task 13).

6. **Update all callers** of `applyMerchantCategoryRules` to use the new fields — specifically the Xero sync pipeline and the backfill endpoint. Where the rule returns `owner`, write it to `transactions.account_owner` if not already set. Where it returns `isSubscription: true`, write to the subscription flag if that column exists.

7. **Update all existing tests** to match the new interface. Add one test per rule asserting its exact full fingerprint output.

---

## [ ] 12. Transaction coverage inspector (/dev/coverage)

**Problem:** There's no fast way to see which transactions are uncovered by rules, or to understand what context a transaction has when the rules engine evaluates it. The training UI gets you there eventually but requires labelling work to reveal context.

**Solution:** A read-only `/dev/coverage` page for rule iteration.

**Page layout:**
- Filter bar: account selector, source (xero/csv), date range, and a toggle "Unmatched only" (default on)
- Table: one row per unique merchant, sorted by transaction count descending
- Columns: merchant, txn count, total value, matched rule (or red "no match" badge), auto category, auto owner, example raw_description (first one, truncated)
- Clicking a row expands it to show: all matching transactions with full context visible — `glAccount`, `isIncome`, `accountScope`, `amount`, `date`, `raw_description`

**The key difference from `/dev/rules`:** this is merchant-first and shows the rule engine context fields inline, so you can see at a glance what the rule engine actually sees and why a rule is or isn't firing. No labelling required.

**API:** `GET /api/dev/coverage?unmatched=true&account=...` — queries `transactions` grouped by merchant, joining on `matched_rule`, returning all context fields needed.

**No write operations on this page** — it's purely a diagnostic tool. Rule changes still happen in `merchantCategoryRules.ts`.

**Tests:**
- Unit test the query/aggregation logic in isolation (extract into a `buildCoverageRows` function): given a list of raw transaction rows, assert it correctly groups by merchant, sums counts and values, picks the first raw_description, and attaches matched_rule (or null).
- Test the `unmatched` filter: with a mix of matched and unmatched rows, assert only the unmatched ones are returned when the flag is set.
- Test the expanded row data: given a merchant with multiple transactions having different glAccount and isIncome values, assert all unique context combinations are returned in the expansion.
- API route integration test: mocked Supabase returning a known set of rows, assert response shape matches the expected coverage schema.

---

---

## [ ] 13. Category taxonomy review — eliminate 'Business' as a catch-all

**Problem:** The collision test from Task 11 will expose that several rules produce identical fingerprints because 'Business' is used for genuinely different transaction types:
- Legitimate BHT operating expenses (Bell Partners accounting fees)
- Personal charges running through the business card (Steam, Xbox, Spotify, Google One)
- Business revenue (Oncore, Crosslateral, invoices) — these are distinguished by `isIncome: true` but the category is still the same string

When multiple rules share the same fingerprint, it means the category taxonomy can't represent the distinction. That makes reporting ambiguous — "Business" spending can't be broken down further without reading the rule name.

**Goal:** Every rule should have a unique fingerprint after this task. Any collision that remains after Task 11 gets resolved here.

**Work through each collision and decide:**
- Should the two rules merge into one (genuinely the same type of transaction)? If so, merge and delete the duplicate.
- Or are they different types that need different categories? If so, assign a more specific category. Candidates:
  - Entertainment subscriptions on the business card (Steam, Xbox, Spotify) → category: 'Entertainment', owner: 'Business', isSubscription: true — these are paid from the BHT account deliberately and count as business expenses, but 'Business' is too broad a category for them
  - Google One → needs a decision: 'Technology' or 'Business', owner: 'Business', isSubscription: true
  - Actual BHT operating costs (Bell Partners) → category: 'Business', owner: 'Business'
  - Food/drink transactions from the business account that are personal in nature → category: 'Eating Out', owner: 'Steven' or 'Nicola' as appropriate — these are the exception case where a business account transaction needs a personal owner. Covered by merchant-specific rules rather than a blanket account-scope rule.
  - BHT payroll costs (wages, super) → already separate as 'Payroll Expense', owner: 'Business'

**Audit the full category list** in the training UI against the fingerprint design:
- 'Salary' vs 'Director Income' — what's the distinction? Is one for employment income and the other for director's fee draws? Make that explicit in rule descriptions.
- 'Business' used for income vs expense — should income be 'Business Revenue' and expense remain 'Business'? Or is `isIncome: true` the discriminator and the category stays 'Business'? Decide and document.
- Any category that appears on only one rule is fine. Any category shared by multiple rules must be justified.

**Output of this task:** an updated `MERCHANT_CATEGORY_RULES` where the collision test from Task 11 passes with zero collisions, and a short note in the file header explaining the category conventions (e.g. "Business = BHT operating expense; owner field distinguishes personal-on-business-card from actual business spend").

**Tests:** This task is primarily about rule data, not new logic, so the test bar is: the fingerprint collision test from Task 11 passes with zero collisions (this is the acceptance test). Additionally, every rule whose fingerprint changed or was added must have its test in `merchantCategoryRules.test.ts` updated to assert the new full fingerprint. No rule should be left with a test that only checks `category` — all five output fields must be asserted in every rule test after this task.

---

## Done when:
- All 13 tasks committed and pushed
- `npm test` passes after all changes
- Vercel deployment is READY
- Update STATE_HEARTH.md in C:\dev\portfoliostate\ with what shipped, then commit and push portfoliostate
