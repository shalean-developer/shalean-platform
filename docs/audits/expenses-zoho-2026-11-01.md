# Expenses / Zoho audit — 1 November 2026

Decision: **NO-GO for production / stage closure. Source remediation prepared; hosted staging and live range reconciliation remain outstanding.**

## Scope and authority

Farai's request on 1 November authorizes this bounded Expenses integration audit, source implementation, isolated testing and staging verification. It does not authorize a production merge, production migration, financial corrections or customer messages. Preserve PR #1000 (invoice metadata), historical evidence and unrelated stages.

Read AGENTS.md, Engineering Standard v1.1, release-control README, the bookkeeping operating policy and BK-02 ownership map. Current main inspected: `ed28c9827f19145fd85499552e77d629cef7ec76`; initially clean checkout. Dedicated branch: `fix/expenses-zoho-mirror`.

Canonical E2E tracker successfully read through Drive: `SHALEAN-E2E-MASTER`, spreadsheet `1iMS7S5XX7i8v0gZjvb7UD_tfPD1jeYaVxDmPssWTxa8`, last modified 7 October 2026. It still records Stage 03 in progress and Stage 04 not started; its dashboard and rows contain stale October state. Do not infer later acceptance or reopen other stages from this read. The September convergence tracker was also inspected and is superseded for current audit status. This work is the explicitly requested bounded Expenses fix, not a general Stage 04 expansion. Neither tracker was modified or marked closed.

## Verified current state

- Production `/api/health/environment`: release `f1b645f130e3aeefa28cd292db379d5688e4a13e`, production database `paqjwfulwywtsyyvdxrq`, `issues=[]`.
- Relevant Expenses page/loader/outbound sync implementation is unchanged between that production commit and inspected main (additional unrelated test file on main retained).
- Live Expenses UI: first page starts with older dates despite requesting descending order; the category selector only offers the category present on that page. No Zoho import action or successful-import timestamp.
- Read-only production SQL confirmed a mixture of locally synced and unsynced expense records. Detailed private financial counts are intentionally excluded from this public-source report.
- Explicit comparison window: **1–31 October 2026 inclusive**, source accounting dates, ZAR. The local ledger was counted and totalled privately; those values are not a reconciled Zoho total and are excluded from the proposed public report.
- Zoho UI organisation **927500285** directly inspected. Its Expenses list includes recent Fuel, Chemicals, Telephone, Transport and processing fees; it also includes Internal Transfers Clearing and Director Loan records. Listing an entry in Zoho's Expenses module is not proof it belongs in operating expenses.
- Integration UI indicates configured OAuth and recent outbound queue activity. Unrelated invoice-payment work was left untouched.

## Root cause and defects

1. **High — missing inbound integration.** `GET /api/admin/expenses` calls `loadExpenseList`/`loadExpenseSummary`, reading local `expenses` only. Page Refresh calls refetch only. `syncExpenseToZoho` is an outbound create path, not an inbound reader. Repository search finds no production Zoho expense import. Thus new/changed expenses entered in Zoho have no path into this page; refreshing or rerunning the outbound queue cannot import them.
2. **Medium — reversed ordering.** The loader inverted the requested ascending flag for dates. Added a stable ID tie-breaker.
3. **Medium — monetary precision hidden.** Page formatting rounded amounts to whole rand. Preserve cents.
4. **Medium — misleading filter coverage.** Local category choices derive from only the current page. The new Zoho view derives category/payment-account choices from the entire imported range. Existing local approval workflow retained separately; local all-time summary limitations remain labelled.
5. **High — classification requirement.** A naive expense-module or bank-withdrawal import would count transfers/assets/loans as expenses. Classification uses chart-of-accounts type; unknown/ambiguous mappings and non-ZAR records are retained for review but excluded from ZAR operating totals.

## Field-level ownership

| Fields | Owner | Projection / mutation rule |
|---|---|---|
| Zoho expense ID and organisation | Zoho | Immutable string identity; reject duplicate/missing/unsafe numeric IDs |
| Date, total, currency, tax/source fields | Zoho | Preserve raw list record and integer cents; no inferred FX conversions |
| Expense category/account ID, account type | Zoho chart of accounts | Exact account ID, or unique exact name if list omits ID; no name-based operating classification |
| Paid-through account ID/name | Zoho | Preserve when supplied; missing values remain explicitly unavailable |
| Vendor, description, reference, source transaction/reconciliation identifiers | Zoho | Preserve source list fields and raw payload; never infer bank matches |
| Receipt/attachment information | Zoho | Preserve supplied list fields and link to original detail/receipt UI; no binary copying or attachment writeback |
| Local submission, branch, approvals, booking and payment links | Shalean | Existing `expenses` ledger unchanged by inbound import |
| Attempt time, complete snapshot time, error | Shalean integration | Complete period snapshot only; failed attempts retain previous result |

Unverified customer receipts, revenue corrections, Paystack settlements, invoices, customer receipts, bank matches and accounting trails remain outside mutation scope. No current balance claim is made. Private accounting references and customer details are excluded from this proposed public report.

## Implementation

A new service-role-only, RLS-enabled `zoho_expense_period_mirror` table stores a complete snapshot per organisation/date window. All provider pages are checked before one atomic snapshot replacement. Repeat sync replaces the projection and never creates financial entries. Changed amounts/categories and deleted/moved-out-of-range expenses appear on the next complete refresh of that range. Failed/partial pages do not replace data. Database lease acquisition fails closed, with a bounded import and recovery after lease expiry.

The default page view reads this Zoho projection. Existing local submissions/approvals remain available separately. Search includes description/reference/vendor/ID; filters cover the full snapshot; precise amounts, source links, last success, last attempt, loading/never-imported/empty/error states are explicit. Imported rows have no local edit/delete/approve controls.

Mirror requests use existing server OAuth with an opt-in single 401 GET token refresh/retry. Existing financial writes are never replayed by that option. GET requires finance.full.view; import POST requires expense.manage. A production import requires the known production DB and organisation 927500285 together. Nonproduction requires its verified separate DB, a separate Zoho organisation, and `ZOHO_EXPENSE_IMPORT_TEST_ORG_ID` matching that test organisation. No secrets added to source.

## Supported scope and limitations

- Manual **Sync from Zoho** refreshes the selected date window (at most 367 inclusive days / 10,000 records). No new scheduler or webhook is activated. This is a full-window refresh, not a modification-time incremental cursor.
- Changes outside the selected range require refreshing the corresponding range. Snapshots for overlapping ranges can have different last-success times; each displays its exact period/time.
- Zoho list pagination has no documented transactional snapshot token. Concurrent provider edits during a multi-page import remain a live acceptance consideration; repeat-ID detection fails closed and a subsequent complete refresh recovers.
- Unknown/ambiguous account mappings and foreign currency records require review. Raw source totals, excluded counts and operating totals must be reconciled separately.
- Attachments/reconciliation details not supplied by the list API are accessible in Zoho, not fabricated locally. No generic imported-record writeback is introduced. Existing local outbound expense create behavior is preserved.
- Cache snapshots are read models and never alter finance dashboards, local approval calculations or source accounting records.

## Validation and outstanding gates

Local: 40 focused tests PASS (pagination, classification, amount/date validation, failures, repeat/changed/empty imports, SQL/RLS/ACL, environment isolation, token recovery, API denials, UI). Critical suite: 128 files / 1,486 tests PASS. TypeScript PASS. Enforced booking-core lint PASS with 4 pre-existing warnings; changed-source lint has no errors. Migration filename governance PASS (207 unique files). Webpack production build PASS without credentials; this proves compilation/static generation, not database-backed integration acceptance.

Staging is **NOT VERIFIED**: pricing-test health navigation timed out and subsequent browser access timed out. Connected Supabase account exposes only production. Existing staging builder explicitly guards source branch main; this candidate is deliberately unmerged. Do not merge main merely to manufacture staging evidence. A branch-capable staging deployment route plus staging DB access and a separate Zoho TEST organisation are needed to execute the acceptance below. No hosted migrations/imports/deployments performed.

1. Apply the reviewed migration to verified staging only; verify ACL/RLS and environment guards.
2. Deploy the exact candidate SHA to staging using a source-preserving branch-capable route; verify health version/project/test keys/outbound guards.
3. In TEST Zoho, compare same-range source IDs/count/excluded categories/cents to cached results. Add and update an expense; refresh twice; verify unchanged IDs and no duplicates. Remove or move a test expense; refresh; verify projection update with preserved source history.
4. Exercise permission denial, revoked/expired token, partial pagination, concurrency and retry recovery; confirm last complete result remains visible.
5. Verify desktop/mobile UI and source detail/receipt links.
6. Only after staging PASS, request exact production merge/migration/deployment authorization. Reconcile **1–31 October 2026** against live Zoho, IDs and totals by classification before closing.

Recovery: revert candidate app to prior approved artifact; leave additive service-role-only cache dormant. No source-ledger reversal or balancing entry is needed. Never delete existing ledger history as rollback.

## Publication status

At source preparation, automatic approval review rejected publication to the public repository because the original audit document contained private financial details. Those details were removed from the proposed public document. The unpublished commits were consolidated so the proposed branch history does not include the original private report. Farai subsequently explicitly approved publishing the sanitized branch and opening a draft PR on 1 November 2026. This approval does not authorize production merge, migration or deployment. Current publication and CI evidence is recorded on the draft PR.
