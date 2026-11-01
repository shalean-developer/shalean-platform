# Cash-flow forecast period correction — 1 November 2026

Status: isolated regression PASS; hosted staging and production reconciliation PENDING.

Owner request: fix expected-income/expected-expenses cards, period scope and contributing-record visibility. No accounting or payout processing changes.

## Verified defects

Issued monthly invoice balances and pending/frozen/approved payout batches were summed across all dates, while recurring expenses used the selected range. Forecast read errors could silently become zero totals and source reads were not paginated. Recurring schedules counted only their next occurrence, potentially overlapping generated expenses. Cards rounded away cents and did not explain dates or source records.

## Ownership and correction

- Local monthly invoice balance/status/closed/currency fields remain authoritative for this forecast. Active promised payment date precedes due date, following existing invoice-forecast policy. Draft/paid/closed/non-ZAR invoices are excluded.
- Local payout amount/status/payment evidence remain authoritative. Expected date follows the existing funding-alert policy: configured day (default 5) in the month following a valid monthly payout period. This is an estimate, not transfer evidence. Paid status or a paid timestamp excludes the payout.
- Active recurring schedules project each occurrence using existing generator frequency advancement. Linked generated expenses replace their template occurrence; approved expenses remain in actual outflows and pending generated expenses count once. Duplicate schedule/date evidence creates a visible review warning without altering source records.
- Forecast reads paginate in stable ID order and fail visibly on errors.
- Range boundaries are inclusive Johannesburg calendar dates. Earlier unpaid amounts and unsupported/missing dates are separate from period cards. Exact cents and contributing record IDs/date/basis/bucket are visible. Responses for another date selection are not presented as current.
- Coverage is issued monthly invoices, existing payout batches and recurring schedules. Future unbilled bookings, uncreated payouts, other Zoho liabilities and arbitrary bank withdrawals are not inferred. No forecast difference is represented as a reconciled whole-business shortfall.
- No migration, invoice/receipt alteration, payout approval/payment, journal, balancing entry, bank-balance write or outbound communication.

## Validation and remaining evidence

14 focused tests PASS; 1,555 critical tests across 137 files PASS. TypeScript PASS. Enforced booking-core lint PASS with four existing warnings. Final CI and release identity belong in the PR evidence.

Read-only production schema inspection confirmed fields before implementation. Subsequent SQL data reads returned internal connector errors, including a simple table count. Live UI confirms old mixed-period figures and no recurring templates visible. Open PRs inspected; unrelated invoice metadata and historical payout work remain untouched. Source tests are not live financial reconciliation.

Next: final CI and source review, staging deployment identity/browser verification, then scoped production promotion and reconciliation. Overall audit remains open. Rollback restores the previous app artifact; no schema or accounting reversal is required.
