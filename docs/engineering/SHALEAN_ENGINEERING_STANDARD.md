# Shalean Engineering Standard

**Version:** 1.1  
**Applies to:** human contributors, ChatGPT, Cursor, Codex, GitHub automation and release operators  
**Repository:** `shalean-developer/shalean-platform`

## Purpose

This standard protects production stability, customer and cleaner data, financial integrity and hosting cost while keeping development fast and reviewable.

The default workflow is: start from current `main`, work on one task branch, validate locally and in GitHub Actions, use staging when runtime acceptance is needed, and merge to `main` only after required checks and explicit approval.

## Non-negotiable rules

1. Do not develop directly on `main` or `staging`.
2. Keep one task on one branch unless a replacement branch is needed to safely recover stale or conflicting work.
3. Do not combine unrelated refactors with the requested change.
4. Never weaken authorization, maker-checker, audit, payment, earnings, payout, booking or data-integrity controls just to make tests pass.
5. Never expose secrets, service-role keys, payment credentials, customer PII, cleaner identity documents or bank details in code, logs, fixtures, screenshots or PR text.
6. Preserve existing behaviour outside the approved scope.
7. Applied production migrations are immutable; corrections require a new forward migration.
8. Required GitHub checks are the source of truth for merge readiness.

## Branching and pull requests

Approved branch prefixes include `feat/`, `fix/`, `chore/`, `docs/` and `audit/`.

Start from the latest `main` unless continuing an already-approved branch. Before merge, compare against current `main`; if a branch is badly stale or would downgrade newer production controls, salvage only the still-valid work onto a fresh branch instead of force-merging old history.

Every PR should state the problem, implemented scope, deliberately unchanged areas, security/database/financial impact, tests run, staging requirement, and rollback or recovery notes when risk is meaningful.

Delete merged or formally abandoned branches after their useful work has been incorporated.

## Repository and test model

This repository is an npm monorepo without a root npm workspace. Do **not** use root `npm ci` as a blanket install command. Install and test in the affected application directory.

For `apps/web`, the enforced CI workflow in `.github/workflows/web-test.yml` is authoritative. Typical local checks are:

```bash
cd apps/web
npm ci
npm run test:critical
npm run typecheck
npm run lint:booking-core
```

Run targeted tests for the changed domain. Validate migrations from the repository root with:

```bash
npm run db:migrations:validate
```

Do not treat full `npm run lint` as a required gate unless CI is changed to enforce it. For production-build behaviour, remember CI deliberately uses the repository's current Webpack production-build path; do not substitute an unrelated build mode and call it equivalent.

## Staging and production

Use staging for customer-facing, role-sensitive, integration-heavy or otherwise high-risk runtime acceptance when it adds real evidence. Documentation-only and governance-only changes normally do not need staging.

Merge to `main` only after required checks pass and any required staging verification is complete. A merge is a code change; release or promotion procedures must still follow the repository's current release-control standard under `docs/governance/release-control/`.

Do not redeploy repeatedly as a substitute for local testing. Batch corrections where practical to reduce unnecessary hosting usage.

## Production safety review

Explicitly assess changes touching authentication, admin roles/scoping, personal information, booking creation/allocation/recurrence, pricing/discounts/equipment, Paystack, invoices, cleaner earnings, payout batches, maker-checker approval, Supabase, Resend, WhatsApp, SMS, Google integrations, cron jobs, retries, idempotency, redirects, canonicals or analytics.

High-risk paths should fail closed, be idempotent where applicable, preserve auditability and include focused regression tests.

## Coding standards

- Validate external and user-provided input server-side.
- Server-side authorization is authoritative; UI visibility is not a security boundary.
- Prefer least privilege and deny unknown roles, scopes and unsafe destinations.
- Keep financial calculations in tested domain functions and use integer cents where the approved model supports it.
- Make timezone choices explicit; Shalean operational dates use `Africa/Johannesburg` unless an integration requires UTC.
- Select only required database columns and preserve branch, team, tenant and cleaner scope.
- Prefer direct server composition over unnecessary internal HTTP calls.
- Log useful operational context without secrets or sensitive personal data.
- Prefer idempotent handling for payments, invoices, recurring bookings, notifications and payouts.
- Preserve accessibility and clear loading, empty and error states.

## Database rules

- Never rewrite applied migration history.
- New schema/data corrections use forward migrations with governance-compliant filenames.
- Review RLS, grants and service-role assumptions for sensitive changes.
- Backfills should be safely repeatable or resumable where practical.
- Destructive changes need an explicit recovery plan.
- Financial repairs must distinguish source-data correction from formula recalculation.

## AI and automation operating rule

Automated contributors must read `AGENTS.md` and this standard before changing code. They should stay on the approved task branch, minimize unrelated edits, run relevant tests, report risks accurately, and must not claim verification that was not actually performed.

They may merge to `main` only when the user or authorized release operator explicitly requests it and required checks are green. They must not bypass repository protections or staging requirements merely because a tool allows a write.

## Emergency exception

For a confirmed outage, security incident or payment/booking/payout integrity incident, use the smallest safe fix, keep a dedicated branch where possible, run targeted tests, record what was bypassed and why, and complete follow-up review after service is restored.

## Definition of done

A task is complete when scope is implemented without unrelated drift, required tests pass, security/financial/database impact is assessed, required documentation is updated, staging is verified when needed, PR evidence is accurate, approved production merge/release steps are complete, and obsolete branches or temporary artifacts are removed.
