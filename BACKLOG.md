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

## Done when:
- All 7 tasks committed and pushed
- `npm test` passes (297+ tests) after all changes
- Vercel deployment is READY (check deploy status)
- Update STATE_HEARTH.md in C:\dev\portfoliostate\ with what shipped, then commit and push portfoliostate
