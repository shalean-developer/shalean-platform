# CF-02 reconciliation dashboard — 8 November 2026

Owner authorised implementation and staging testing in issue #1051 context. Production release requires separate owner approval. Existing accepted settlement-date, payout-date, fee and expense-disclosure fixes are preserved.

## Defects and correction

The old dashboard displayed one local bank row as cash, used local update timestamps as spending authority, omitted Bokkie/customer-advance verification and derived runway from visit count. Matching bank/book balances alone does not establish beneficial ownership or completed bank-statement reconciliation.

Add a permission-protected GET-only four-account source view with individually mapped Income, Expense, Shalean and Bokkie identities. Verify organisation, account identity, active status, currency and feed metadata; partial, stale, future or invalid data cannot produce a consolidated total. Display signed book-minus-bank differences. Show Clearing and Undeposited Funds book balances outside bank totals; do not claim these are provider-verified pending payouts. Never add processor funds to bank cash.

Staging/development uses explicitly fictional in-memory examples, with differences, equal balances, stale and missing data scenarios. It performs no Zoho or database writes and imports no live finance data. Unknown environments return unavailable evidence. Production reads only the existing approved organisation, with no accounting changes; it remains unreleased.

Safe-to-spend, status and runway fail closed in both the new view and existing API response. Bokkie obligations and customer advances are explicitly unresolved, never zero. Existing local cleaner liability, reserve and receivables remain visibly provisional. Existing forecast source coverage/disclosures and chart basis are preserved. A complete provider-payout connection and transaction-level obligation/advance reconciliation are still required; this change does not claim those capabilities complete.

## Regression scope

Four unique account identities; missing/duplicate/invalid balances; stale/future feed; negative balances; transfer neutrality; signed differences; pending cash excluded; ownership/advance fail-closed; synthetic isolation; production GET-only exact mapping; partial provider failure; loading/error UI must not display previous financial values. Focused tests registered in mandatory critical suite.

## Release and rollback

Use current main lineage through the existing prebuilt staging workflow, deploy/staging and existing Plesk activation. No deployment infrastructure changes. Verify hosted release SHA, isolated Supabase, TEST Paystack, Zoho writes blocked and messaging disabled. Verify all four synthetic scenarios on desktop/mobile; preserve previous runtime rollback. Roll back this source change via revert and the same release path if needed. Do not merge either old production-based PR #1054/#1055.

CF-02 remains OPEN. No financial reconciliation, provider payout completion, production acceptance or closure is implied by synthetic testing.
