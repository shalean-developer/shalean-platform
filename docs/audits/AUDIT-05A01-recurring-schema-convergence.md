# AUDIT-05A01 — Recurring prepayment schema convergence

Status: prepared for independent review. Production mutation and release acceptance remain open.

## Observed source of truth

Read-only production inspection on 15 October 2026 found both recurring_prepaid_packages and recurring_prepaid_allocations absent. Staging has both. The original migration 20260917070000 and staging bootstrap 20261005070000 were not recorded in production. Existing code already requires the package ledger for per-booking recurring generation, checkout, refunds and payment allocation. This work preserves that existing package contract; it does not replace it with per-visit charging.

Seven-day cron history showed 495 generator error runs. The last 24 hours contained 280 repeated package-save warnings for one plan and four dates, 4–25 October. These are repeat events, not 280 different bookings. The immediate error was the missing public.recurring_prepaid_packages table.

## Bounded correction

- Additive, transactional forward migration creates the two existing ledger schemas and indexes if absent, enables RLS, restricts client access, grants service-role access and requests a PostgREST schema refresh. No rows are backfilled or marked paid.
- Allocation/package lookup errors fail before a booking write rather than being treated as an empty ledger. Existing allocations without payment evidence fail closed.
- A covered occurrence waiting for an existing unpaid package remains ungenerated and holds the plan cursor. It is counted as awaiting_payment, separately from hard insert failures. The Office cron warning shows an amber payment wait after a fresh successful run. Schema, allocation-integrity and other insert failures remain errors.

## Verification

Application regressions cover schema/permission/connection read failures before booking creation, genuinely empty ledgers, existing paid allocations, missing payment evidence and pending packages without a replacement booking. Summary regressions distinguish payment waits from real generator failures. Both suites are in test:critical.

The isolated PostgreSQL harness exercises the actual forward migration against missing tables, then populated existing ledgers. It verifies RLS, client privileges, service insert privilege, exact row preservation on migration replay, amount/count constraints and source-booking delete restriction. It has no remote connection.

Reproduce from repository root with an externally installed @electric-sql/pglite module:

`AUDIT_PGLITE_MODULE=<module-file-URL> node scripts/audits/recurring-prepayment-schema-postgres.mjs`

## Staging gate

After exact-head CI and clean independent review, merge through main and use automatic staging publication. Apply only the reviewed forward migration to staging with pre/post ledger hashes. Verify schema, RLS, grants and migration ledger. Exercise fixture-only read/preflight/payment-wait paths under rollback; never invoke the cron endpoint as a read-only smoke check. Verify the exact deployed SHA at https://pricing-test.shalean.co.za/api/health/environment and inspect https://pricing-test.shalean.co.za/office .

## Production gate

Prepare a bounded production candidate after staging passes. Reconcile all runtime dependencies and preserve installed October guards. Obtain approval for the concrete release and migration sequence. Capture booking, payment, package, allocation, earnings and payout controls immediately before execution. Do not replay broad historical migration chains or run a seed/reset.

Creating the missing schema lets the already-scheduled recurring generator progress and may create pending bookings/package rows on its next normal run. Existing payment processing may later charge eligible packages under its existing authorization rules. This is an environment-affecting activation, not merely documentation. Do not claim that future financial data will remain static after the schema becomes available.

Deploy the reviewed application using the normal automatic workflow, then apply the reviewed schema under the approved release procedure. Confirm live SHA and database identity. Observe the next normal generator runs; distinguish expected package-payment waits from errors. Reconcile affected plan dates, exact package totals and duplicates without manually creating or paying bookings. Stop on unknown drift or unexpected data changes. Retain failure history and never retry customer charges simply to clear an alert.

Historical pre-October records and the two separate payout prevention gaps remain outside this correction. No stage-wide closeout is claimed.
