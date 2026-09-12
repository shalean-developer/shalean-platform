---
name: shalean-spc
description: Govern Shalean Platform Convergence Programme tasks SPC-00 through SPC-13 toward SHALEAN BASELINE V1, including task intake, audits, approved implementation, validation, release/UAT evidence, and tracker updates.
---

# Shalean Platform Convergence Programme

## Purpose and authority

Govern SPC-00 through SPC-13 and the path to **SHALEAN BASELINE V1**. Use exactly **one exact SPC Task ID per work unit**; do not silently combine tasks or invent tracker IDs.

- Repository: `shalean-developer/shalean-platform`.
- Production code authority: `main`.
- Release candidate authority: `integration/shalean-release`.
- Current release integration PR at bootstrap: **#477**. Reverify its current state before relying on it as release evidence.
- Programme tracker: [Shalean Platform Convergence Tracker](https://docs.google.com/spreadsheets/d/1IwJRlBqziE74VdXb5EZCV2MpXsHMJDlgwRNmmvWEo_k/edit).

Read repository paths below relative to the repository root. Existing Shalean governance takes precedence where stricter; this skill does not replace it:

1. `AGENTS.md` and any applicable nested `AGENTS.md`.
2. `docs/engineering/SHALEAN_ENGINEERING_STANDARD.md`.
3. Current applicable documents under `docs/governance/release-control/`.

At bootstrap, `docs/governance/release-control/README.md` is the current repository release-control standard and governs the integration candidate too; there is no integration-specific standard in that directory. Reinspect it for superseding governance on each task.

The engineering standard normally starts work from current `main` and allows continuation of an already-approved branch; release-control describes a fresh-main PR flow. The explicitly approved SPC integration context does not waive release safeguards or authorize a different production release sequence. Stay on the approved task branch; resolve any unresolved authority conflict before the affected action. Do not develop directly on `main` or `staging`. Preserve one task per branch and inspect stale branch work before recovery; never mechanically merge history that downgrades production controls.

## Task intake

Before each SPC task:

1. Require the exact SPC Task ID. If missing or multiple IDs are supplied, obtain one work-unit ID before task work begins.
2. Read its exact tracker row when Google Drive access exists, including scope, dependencies, acceptance evidence and blocker state. If access is unavailable, report the row as **NOT VERIFIED**, use the supplied task scope only, and identify any missing information that blocks safe progress. Never claim the tracker was read from its link alone.
3. Read `AGENTS.md` and applicable nested instructions.
4. Read `docs/engineering/SHALEAN_ENGINEERING_STANDARD.md` in full.
5. Read applicable current release-control governance and identify the governing document.
6. Check repository root, origin, current branch, HEAD and `git status --short`; preserve existing user changes.
7. Confirm work is on the approved task branch and is not on `main` or `staging`. Do not switch or create branches contrary to the task authorization.
8. Classify the work as **audit only**, **implementation**, **validation**, or **release/UAT**. Record the approved scope and authorization for that class.
9. Inspect the existing implementation, relevant tests, and current production/integration authorities before proposing changes. Do not assume a tracker finding means the implementation is absent.
10. Preserve scope, identify dependent critical predecessors, and state required evidence. Do not expand into unrelated tasks, cleanup, domain skills, or production actions.

## Audit only

An audit is read-only. It must report all of these fields, using **NOT VERIFIED** for unavailable evidence rather than implying certainty:

- Task ID
- Current state
- Evidence (specific files/lines, SHAs, checks or other inspectable sources)
- Finding
- Severity
- Release-blocker status
- Smallest safe remediation
- Files/components involved
- Database impact
- Security impact
- Financial impact
- Required validation
- Recommended next action

Audit work must not automatically become implementation. **Implementation following an audit requires explicit approval** for the remediation scope. An audit finding or tracker status is not that approval.

## Approved implementation

Make the smallest safe change, avoid unrelated refactors, preserve behavior outside approved scope, and preserve existing authorities. Add focused regression tests where appropriate. Never weaken tests, authorization, RLS, maker-checker, payment, earnings, payout, booking, data-integrity or audit controls just to pass checks.

Apply the engineering standard's server-side validation and authorization, least privilege, explicit timezone handling, scoped data access, safe logging, accessibility and tested financial-domain rules. High-risk paths must fail closed, preserve auditability and be idempotent where applicable. Record security, database and financial impacts, runtime acceptance needs, and rollback/recovery actions when risk is meaningful.

## High-risk work and data safety

Treat these as high-risk: Supabase migrations, RLS, SECURITY DEFINER functions, grants, authentication/RBAC, booking creation, recurring bookings, pricing, discounts, Paystack, refunds, cleaner earnings, team earnings, payouts, invoices, Zoho, cron jobs, retries/idempotency, customer data and cleaner data. Also retain governance's high-risk treatment of collected cash, booking assignment/completion, branch/team scoping, webhook processing, outbound messaging, deployment, CI, migration governance and hosting configuration.

- Never rewrite applied production migrations or applied migration history. Use new forward migrations with the active repository filename convention for applied-history corrections.
- Never assume a remote database is development or empty. Prefer local Supabase for development/testing. Verify the intended environment read-only before any authorized database mutation.
- Never reset production. Production writes require separate explicit Farai approval.
- For approved development/staging seed work, use the governed root seed commands and environment guards in `AGENTS.md` and `scripts/seed-dev.mjs`; do not copy production data or insert ad-hoc seed rows. Preserve seed recipient and outbound messaging guards.
- Never expose service-role or payment secrets, customer PII, cleaner identity documents or bank details in code, logs, fixtures, screenshots, reports or PR text. Privileged credentials must never use `NEXT_PUBLIC_*` variables.
- Review RLS, grants and service-role assumptions. Plan repeatable/resumable backfills where practical; require a recovery plan for destructive changes. Distinguish source-data financial repairs from formula recalculation.
- For schema/app releases, verify compatibility of current production app, migration and target app; record migration order and rollback/repair path, validate invariants, and preserve focused database/payment/security checks.

## Validation and evidence

Respect actual repository CI authority: `.github/workflows/web-test.yml` and required GitHub checks determine merge readiness. Read the current workflow and affected package scripts instead of assuming commands or gates are unchanged.

This is an npm monorepo **without a root npm workspace**. Install per affected app when necessary; do not run a blanket root `npm ci`.

Typical `apps/web` checks, run from `apps/web`:

```text
npm run test:critical
npm run typecheck
npm run lint:booking-core
```

For migration changes, run from the repository root:

```text
npm run db:migrations:validate
```

Use targeted tests for the changed domain; high-risk changes require explicit focused regression checks as well as general CI. Full `npm run lint` is not an enforced gate unless CI changes to enforce it. The package build uses Turbopack, while CI deliberately uses its Webpack production-build path; never describe them as equivalent.

For local web runtime verification follow `AGENTS.md`: use `npm run dev` (Webpack) and `http://localhost:3000`, not the numeric loopback host. Missing credentials can prevent database-backed acceptance even when marketing pages render. Do not treat graceful fallback as verified backend behavior.

Use staging for customer-facing, role-sensitive, integration-heavy or otherwise high-risk runtime acceptance when required by governance and risk. Documentation/governance-only changes normally need no staging. Do not repeatedly redeploy as a substitute for local validation.

Record each check's actual command, context/SHA, result and evidence. Never report **PASS** for anything not run. Use **NOT VERIFIED** when verification could not actually be performed, with the reason and required next check. Local results do not establish that GitHub checks passed. A code change or merge does not establish a healthy deployment.

## Tracker updates and completion

After real verification, support updating only the exact task row's applicable fields:

| Field | Required basis |
| --- | --- |
| Status | Actual stage and verified acceptance evidence |
| Owner | Confirmed responsible owner |
| Branch / PR | Actual branch and existing PR, if any |
| Evidence / Link | Inspectable validation evidence and exact SHA where applicable |
| Blocker / Finding | Remaining findings and dependencies |
| Next Action | Smallest authorized next step |
| Target Date | Confirmed date; do not invent a commitment |
| Release Blocker? | Evidence-based blocker assessment |
| Notes | Limitations, impacts and outstanding verification |

Make tracker writes only within the task's authorization and verify the saved values. Do not overwrite unrelated rows or fields. If Google Drive is inaccessible, report the **exact proposed tracker update**, including Task ID and field/value pairs, and state that it was not made.

Do not mark **Done** merely because code changed. Done requires the task's required evidence and applicable engineering definition of done: scoped implementation or audit deliverable, required tests, assessed impacts, documentation, staging when needed, accurate PR evidence where applicable, and authorized release/cleanup steps when in scope. Missing evidence remains explicit; never perform unapproved release actions to satisfy completion.

## Production authorization and release/UAT

**Normal SPC task approval does NOT authorize production deployment.** Separate explicit approval from **Farai** is required for each applicable production action:

- Merge to `main`
- Production database changes
- Production payments
- Production refunds
- Production payouts
- Production emails
- Production SMS
- Production WhatsApp
- Production push notifications
- Production deployment

Never infer production authorization from approval to audit, implement, validate, open a PR, or merge to an integration branch. Never bypass repository protections or staging requirements. Check existing explicit approval for the specific action and scope; where absent, complete permitted preparation and present the concrete action for approval before execution.

Before an authorized release, require current CI, focused checks, necessary UAT evidence and an identified rollback action. Record the exact current Git SHA, deployment, migration versions, validation and rollback target; never reuse stale deployment IDs. Follow the current release-control sequence and verify affected paths after an authorized deployment. Smoke checks involving production payments or communications need their own applicable authorization. If smoke criteria fail, follow the approved rollback plan; do not infer permission for otherwise unapproved production mutations.

## Programme order

| Task | Programme stage |
| --- | --- |
| SPC-00 | Freeze & Authority Baseline |
| SPC-01 | Repository & PR Convergence Audit |
| SPC-02 | Database & Supabase Integrity |
| SPC-03 | Booking Source of Truth |
| SPC-04 | Money & Financial Integrity |
| SPC-05 | Authentication, Roles & RBAC |
| SPC-06 | Application Reliability |
| SPC-07 | Public Website & UI Convergence |
| SPC-08 | SEO & Public-Site Integrity |
| SPC-09 | Integration Release Candidate |
| SPC-10 | Staging / UAT |
| SPC-11 | Production Release |
| SPC-12 | Repository Cleanup |
| SPC-13 | New Development Rules |

Do not skip an unresolved critical predecessor when the later task depends on it. Report the dependency and next action without silently expanding the work unit beyond its one Task ID.
