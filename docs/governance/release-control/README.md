# Shalean Release Control

This directory defines the current release-control standard for `shalean-platform`.

## Principles

1. `main` is the production source branch, but a merge is not proof that customer traffic is healthy.
2. Required GitHub checks must pass before merge. Do not weaken the current CI workflows to recover an old branch.
3. Database migrations are forward-only and must use the repository's active migration filename convention.
4. Payment, booking, authentication, RBAC, messaging, and other high-impact changes require focused regression checks in addition to general CI.
5. Production changes must have a rollback action identified before release.
6. Release evidence should describe the exact current Git SHA, deployment, migration versions, validation, and rollback target. Do not reuse stale deployment IDs from previous releases.

## Standard release sequence

For app-only changes:

1. Open a PR from a fresh branch based on current `main`.
2. Review the diff for stale or unrelated files.
3. Run required CI and focused checks.
4. Merge only after checks pass.
5. Verify production deployment and smoke the affected customer/admin paths.
6. Roll back if the release fails its smoke criteria.

For schema + app changes:

1. Confirm the migration is forward-only and correctly named.
2. Validate compatibility between the current production app, migration, and target app version.
3. Record the intended migration order and rollback/repair path.
4. Complete required CI and focused database/payment/security tests.
5. Apply the approved migration in the intended environment.
6. Verify schema/data invariants.
7. Deploy/promote the approved application SHA.
8. Run production smoke checks and capture evidence.

## High-risk changes

Treat the following as high-risk unless clearly proven otherwise:

- payment settlement, refunds, collected-cash fields, invoices, payouts
- booking creation, confirmation, recurring generation, assignment, or completion
- authentication, permissions, admin RBAC, branch/team scoping
- production database migrations or repair scripts
- customer/cleaner outbound messaging and webhook processing
- deployment, CI, migration-governance, or Vercel configuration

For these changes, require explicit focused tests and avoid bundling unrelated cleanup into the same PR.

## Branch recovery rule

When an old branch is far behind `main`, do not merge it mechanically. Audit its unique work first. If the useful work has already landed, delete the branch. If some work remains valid, recreate only that work on a fresh branch from current `main` and preserve the newer production implementation.

## Release evidence

Use `.github/workflows/release-evidence-reminder.yml` as a manual checklist helper. It records no deployment and performs no production mutation.
