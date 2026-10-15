# AUDIT-03C-02 production release candidate

Production execution is NOT authorized by this preparation record. PR #936 must pass exact-head CI, independent review and owner release approval before any production migration or merge.

## Scope and provenance

Apply the bounded changes reviewed in #935 and #937 to production baseline 616f773b8f89c0fb3f92d4857c7e285b5a137451 using three-way patch application. Preserve production-specific payment retry safeguards and deployment history. July reporting remains unchanged; new payout processing starts with October visits after month closure in Johannesburg. No historical accounting repair, seed/reset, beneficiary approval or actual payout is included.

Staging accepted: reviewed head 7b08dfd0, main merge 045d3b41e61518168872d5106ef21a99cb22be2b, automatic staging artifact 57d0f92a. User-supplied health response at 2026-10-15T06:26:10.710Z confirms the exact merge SHA, staging database uwvnmluiqbczeduzjgse, test Paystack keys, outbound disabled and no environment issues. All five rollback SQL suites passed against installed staging guards; 12 bookings and hash 3d9137ac10fdbbd2547972872a6eb100 unchanged, zero earnings/payouts/transfers/effect jobs. Live UI covers authenticated empty payout state only.

## Approved release execution sequence (after owner approval)

1. Recheck production branch/head and PR exact-head CI/review. Inspect production migration ledger and confirm target paqjwfulwywtsyyvdxrq. Stop on drift or unknown migration dependencies.
2. Capture read-only row counts, full-row hashes and amount/status aggregates for bookings, cleaner_earnings, cleaner_payouts, roster/team payout items, payout runs, transfers and outbox; capture security advisor baseline. Avoid exposing personal row contents. Record active processing jobs; stop if an in-flight financial operation prevents a consistent release window.
3. Apply only the six SQL migrations below, in order, using the reviewed release contents. Verify each transaction and canonical ledger entry before continuing. Do not run fixture test scripts in production.
4. Reconcile the same financial controls after DDL. Investigate any changed totals or historical records before application promotion. Migration SQL changes guards/functions, not historical accounting balances.
5. Merge the approved exact release head through PR #936. Allow the existing automatic production workflow; no manual workflow dispatch or force rewrite of deployment branches.
6. Verify automatic build and artifact release SHA, then live health releaseSha, production environment/database and live provider configuration without exposing secrets. Read-only smoke-check Office payout views, historical reporting and logs. Do not generate/approve/pay/export actionable bank instructions for verification.
7. Record post-deploy controls, monitor new database guard errors and payment-effect retries, and reconcile historical aggregates. October remains unavailable for payout processing until 1 November 2026 Johannesburg.

Migration order:

- 20261014140342_audit_03c02_october_payout_cutoff.sql
- 20261014142019_audit_03c02_october_rpc_fences.sql
- 20261014145923_audit_03c02_verified_provider_convergence.sql
- 20261014155906_audit_03c02_protect_historical_item_deletes.sql
- 20261014173544_audit_03c02_complete_historical_boundaries.sql
- 20261015025906_audit_03c02_payment_effect_retries.sql

## Failure and rollback

Stop at any failed migration, mismatched SHA/environment, financial-control discrepancy, or failed mandatory smoke check. Each migration is transactional; confirm the ledger before retrying, never assume a timed-out request failed. Do not remove guards or rewrite historical rows to make a check pass. Leave successfully installed protections in place if application promotion has not occurred, and prepare a separately reviewed forward correction. If application rollback is required, prepare a revert to the prior production application through the normal reviewed automatic-deployment path; assess compatibility with the installed guards before executing. No automatic down migration, database reset or historical-data restoration is authorized. Owner approval is required for production corrective actions outside the approved release scope.

## Gate

Production release: NO-GO until fresh candidate CI and independent review pass and owner approves the concrete release. Staging acceptance does not authorize production promotion.
