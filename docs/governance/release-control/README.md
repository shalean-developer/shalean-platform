# Shalean Release Control

This directory defines the current release-control standard for `shalean-platform`.

## Principles

1. `main` is the production source branch, but a merge is not proof that customer traffic is healthy.
2. Required GitHub checks must pass before merge. Do not weaken the current CI workflows to recover an old branch.
3. Database migrations are forward-only and must use the repository's active migration filename convention.
4. Payment, booking, authentication, RBAC, messaging, and other high-impact changes require focused regression checks in addition to general CI.
5. Production changes must have a rollback action identified before release.
6. Release evidence should describe the exact current Git SHA, deployment, migration versions, validation, and rollback target. Do not reuse stale deployment IDs from previous releases.

## SPC programme freeze

Approved by Farai under SPC-00-04, effective **2026-09-05**, this freeze remains in force until explicitly lifted by Farai under governed SPC authority. It limits work admission before the standard release sequence below; all existing release safeguards still apply.

Only these work classes may proceed during the freeze:

- explicitly approved SPC convergence work;
- approved release-blocking fixes;
- approved critical production, security or data-integrity fixes;
- explicitly approved bounded operational fixes that do not expand into a new broad programme.

Classification alone is not approval. Until the freeze is explicitly lifted, no new large feature or redesign programme may begin, no existing programme may materially expand its scope outside an explicitly approved SPC work unit, and no branch or PR may become an alternative release authority. Any proposed new broad feature, redesign or programme-level work must remain paused unless Farai first explicitly lifts or amends this freeze. While the freeze remains in force, permitted work must be admitted under an exact governed SPC work unit or one of the allowed fix categories above; an existing branch, PR or programme does not grant admission.

Existing programme disposition:

- `main` remains production code authority; `integration/shalean-release` remains the sole release candidate.
- RD / Shalean Redesign expansion is frozen. [PR #481](https://github.com/shalean-developer/shalean-platform/pull/481) is specifically frozen as an RD expansion proposal; its work may proceed only when admitted as one or more separately approved exact SPC work units.
- Existing RD branches (including `design/rd04-platform-redesign`), SR branches/work and `integration/shalean-repairs` are feeders only into governed SPC/release work. They have no independent programme or release authority; each admitted slice must meet the permitted-work and approval rules above.
- Older direct-to-main PRs must be reviewed and dispositioned under SPC-01. This freeze approval does not authorize them to merge, and their prior existence does not grant admission.

This rule does not itself close, retarget, merge or otherwise modify any PR. It does not authorize merge to `main`, production deployment, production database changes, production-data mutation, payments, refunds, payouts or outbound customer/cleaner messaging. Those actions continue to require their normal separate approvals.

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
