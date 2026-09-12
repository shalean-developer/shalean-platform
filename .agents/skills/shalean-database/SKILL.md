---
name: shalean-database
description: Govern Shalean SPC-02 Database & Supabase Integrity audits, migration governance, schema compatibility, RLS, grants, RPC/function security, and safe database remediation planning. Use together with shalean-spc for approved SPC-02 work.
---

# Shalean Database & Supabase Integrity

## Authority and scope

This skill governs **SPC-02 only** and must be used together with `$shalean-spc`. Read the master at `.agents/skills/shalean-spc/SKILL.md`; paths in this document are relative to the repository root. The master and stricter repository governance take precedence. Report conflicts and apply the stricter rule before the affected action.

Programme tracker: [Shalean Platform Convergence Tracker](https://docs.google.com/spreadsheets/d/1IwJRlBqziE74VdXb5EZCV2MpXsHMJDlgwRNmmvWEo_k/edit). Follow the master's exact-row access, evidence and update rules. Skill creation or validation does not establish database integrity or complete SPC-02.

Before task work, read fully:

- `AGENTS.md` and applicable nested instructions.
- `.agents/skills/shalean-spc/SKILL.md`.
- `docs/engineering/SHALEAN_ENGINEERING_STANDARD.md`.
- Current applicable governance under `docs/governance/release-control/`; at creation this is `README.md`.
- `docs/database-baseline/migration-governance.md`, `.github/workflows/migration-governance.yml` and `scripts/validate-supabase-migrations.mjs`.
- Current root `package.json`, `supabase/config.toml`, and affected database objects, migrations, tests and scripts.

Preserve the master's production authority (`main`), release candidate (`integration/shalean-release`) and approved task branch. The approved integration context does not waive the normal main-based release/migration workflow or authorize production changes.

In scope: migration inventory, filenames/order, clean replay, local reset/rebuild validation, schema drift, application/schema compatibility, tables/columns, primary and foreign keys, unique/check constraints, indexes, views, triggers, functions/RPCs, SECURITY DEFINER, grants, RLS enablement/policies, service-role assumptions, extensions, database cron jobs, storage database policies, seed/reference boundaries, backfills, repair scripts, destructive-change recovery, rollback/forward-repair planning, and explicitly authorized read-only production schema comparison.

Report cross-domain dependencies without expanding the one approved SPC Task ID:

| Boundary | Domain handoff |
| --- | --- |
| Booking business logic | `shalean-bookings` |
| Payments, earnings and payout accounting | `shalean-finance` |
| Broad roles and application authorization | `shalean-rbac` |
| Generic build/test work | `shalean-quality` |
| Public UI and SEO | `shalean-public-site` |
| Release execution | `shalean-release` |

These are domain boundaries, not evidence that the other skills exist or permission to create them. Database security and compatibility analysis remain in scope; changing another domain requires its own approved work unit.

## Intake and read-only audit

1. Require exactly one exact **SPC-02 Task ID**, and follow every `$shalean-spc` intake step: tracker row when access exists, governing documents, repository identity, branch/HEAD/status, non-main confirmation, classification, existing implementation inspection and scope preservation.
2. Identify the inspected environment as **local**, **development**, **staging**, **production** or **unknown**. If unknown, STOP before mutation.
3. Verify database/project identity through safe metadata without printing secrets. A branch, environment variable name, saved connection or linked CLI project is not proof of the target environment.
4. Determine the authorized remote access scope: read-only or specific mutation. Production read-only inspection also requires confirmed access and explicit scope; do not assume it is permitted.
5. Prefer repository migrations and authorized local Supabase evidence. Repository files establish intended definitions, not observed live schema. Never assume current remote schema matches migration history or that production history can be rewritten.
6. Audit is **READ-ONLY by default**. Review SQL and called functions before execution: a query filename or SELECT statement does not prove absence of writes or external effects. Local reset, replay, seeding and repair are mutations, not audit actions.

Audit findings do not authorize implementation. Implementation following audit requires explicit approval of the smallest safe remediation; preserve the master's tests, authorization, maker-checker, financial and audit controls.

Audit output must include all of the following, plus any master audit fields not covered:

- Task ID
- Environment inspected
- Current state
- Repository evidence
- Database evidence
- Migration-history evidence
- Finding
- Severity
- Release blocker?
- Data-loss risk
- RLS/security impact
- Application compatibility impact
- Financial impact
- Smallest safe remediation
- Files/components involved and database impact
- Forward migration required?
- Backfill required?
- Recovery/rollback requirement
- Required validation
- Recommended next action

Use **NOT VERIFIED** wherever evidence was not actually obtained. Attach exact paths, object signatures, SHAs, sanitized query/check results and environment context. Do not reuse historical report counts or PASS verdicts as current evidence.

## Repository database map and migration governance

At creation, `supabase/migrations/` is the only active replay directory: baseline `20260714010000_production_baseline.sql` plus forward deltas. `supabase/migrations-legacy/` is archival evidence only and must not be replayed or moved into the active directory without an approved remediation plan. Do not edit the archive for routine schema work.

`supabase/queries/`, `supabase/scripts/`, top-level verification SQL and `supabase/tests/` provide candidate evidence/checks; inspect their effects and applicability before use. `supabase/seed/reference/pricing.sql` and `supabase/seeds/nonprod/` serve distinct reference/fixture purposes. `supabase/functions/` contains workers that may cause outbound or financial effects. Architecture documents explain dependencies but do not establish current deployment or authorize a cutover.

Enforce these rules:

- Applied production migrations are immutable. Never rename, reorder, edit or delete them to clean up local history. Preserve the master's prohibition on rewriting applied migration history; corrections use new forward migrations.
- Migration governance records the narrow historical exception `MIG-HIST-001`. It is not general permission to rewrite history. Under this skill the stricter SPC immutability rule applies; report the conflict rather than invoking or extending the exception.
- Re-read the current filename convention. At creation it is `^\d{14}_[a-z0-9_]+\.sql$`: unique 14-digit timestamp prefixes, lowercase snake_case descriptions, no non-SQL files or subdirectories in the active directory.
- For separately approved migration authoring, use the governed `npx supabase migration new <snake_case_description>` workflow. Inspect CLI help/version before use and verify the generated name/order. Never invent short counters, reorder applied files or backdate changes to conceal dependencies.
- Run `npm run db:migrations:validate` before proposing promotion and review ordered dependencies. The current validator checks names, timestamp uniqueness, directory contents and nested dollar-quote reuse in DO blocks; it is not a SQL parser, replay test or remote-history reconciliation tool.
- Distinguish repository order, local applied history, development/staging applied history and production applied history. Never infer one from another or alter history metadata merely to produce matching lists.
- Do not perform dashboard-only production/shared-staging schema changes. Keep authorized changes in reviewed migrations and use the approved environment workflow. A documented emergency procedure is not permission to bypass SPC authorization.
- Keep secrets, credential-bearing connection strings, environment-specific cron targets and project credentials out of committed SQL and evidence.

Before seeking migration implementation approval, prepare: the exact problem; affected schema objects; current migration-history evidence; backward/application compatibility assessment; data-loss assessment; RLS/grants/security assessment; rollback or forward-repair plan; focused tests; clean replay plan; and environment promotion order. Approval to author a file does not authorize applying it remotely.

## Local-first validation and seed boundaries

Prefer local Supabase for destructive/replay validation, only when that mutation is within approved scope and the local data's disposability/recovery is established. Re-read repository scripts before running them. Current root commands are:

| Command | Current purpose and boundary |
| --- | --- |
| `npm run db:migrations:validate` | Static active migration governance validation |
| `npm run dev:local:start` | Starts the local Supabase stack; review startup/replay and background-job effects first |
| `npm run dev:local:status` | Local status; raw CLI output may include credentials, so capture privately and expose only sanitized metadata |
| `npm run dev:local:reset` | Maps to `npx supabase db reset --local`; destructive local rebuild requiring verified local target |

Never run a reset command against a remote project. Never reset production, including when another document describes production actions as approval-gated. Preserve this stronger master prohibition.

At creation, `supabase/config.toml` specifies PostgreSQL 15, local API port 54321, database port 54322 and exposed schemas `public` and `graphql_public`. Treat this as repository configuration, not proof of a running database's identity. `scripts/check-local-dev-env.mjs` checks local mode and loopback API configuration; inspect its output paths before use because error messages can include supplied values. The web browser must use `http://localhost:3000` per `AGENTS.md`; that rule is separate from local database connection identity.

Before local startup/replay, inspect migrations, triggers, cron/HTTP targets and seed behavior for unintended outbound effects. Keep local validation isolated from production services and use governed fixtures and messaging guards. Do not run workers, payment paths or communications merely to test a schema.

Use current approved seed commands and guards from `AGENTS.md` and the relevant scripts. The development/staging seed has environment, production-ref and optional allowlist guards; do not bypass them to run in local mode. Local fixture scripts and reference exports are separate operations requiring their own verified target and scope. Never assume remote development data is empty. Never copy production data into local/development without separate governed, explicit authorization.

## RLS, grants and privileged code

For operational, personal or financial tables, explicitly inspect RLS enablement, policies by role and operation, grants/default grants, service-role bypass assumptions, SECURITY DEFINER use, search_path, function EXECUTE permissions, anonymous/authenticated access, ownership and cross-team/customer leakage risk. Include exposed views and storage database policies where relevant; table policies alone do not establish safe access through every interface.

For every SECURITY DEFINER function, inspect its exact signature and owner, explicit safe search_path, least-privilege grants, caller authorization, input validation, tenant/team/customer scope and potential privilege escalation. Do not treat a successful privileged service-role query as evidence that user-scoped access is safe.

Plan focused allowed/denied checks for actual roles and operations, including cross-scope access and relevant function overloads. Preserve server-side authority and fail-closed behavior. Never weaken RLS, grants, tests or other controls merely to make an application test pass. Broad application-role redesign belongs to the RBAC domain.

## Repair scripts and backfills

Require a source-of-truth definition, affected row estimate, practical dry-run capability, idempotent or safely resumable behavior, bounded/scoped updates, audit evidence, pre/post invariants, rollback/recovery plan and explicit environment authorization. Assess trigger, constraint, lock and downstream job effects before execution.

Do not conceal formula recalculation inside source-data repair. Financial semantics must remain with the finance authority. Production backfills require separate explicit Farai approval for the exact action and scope.

## Production boundary

Normal SPC approval does **NOT** authorize production SQL writes, migrations, schema changes, backfills, deletes, truncates, resets, RLS/grant changes or cron changes. Any otherwise permitted production database action requires separate explicit **Farai approval** for its exact action, environment and scope. Remote resets remain prohibited. Confirm read-only production access and scope before inspecting production.

Never print `SUPABASE_SERVICE_ROLE_KEY`, database passwords, credential-bearing connection strings, API secrets, customer PII, or cleaner identity/banking information. Redact evidence before it reaches tool output, logs, screenshots or reports; never put privileged values in `NEXT_PUBLIC_*` variables.

Retain all master production controls for merges, deployment, payments, refunds, payouts and outbound messaging. Database-task approval does not authorize any of those actions. Release execution is a separate approved domain; record compatibility, migration order and rollback evidence without executing a release.

## Validation evidence and SPC-02 exit gate

Keep these evidence classes separate:

| Class | Required evidence for the applicable scope |
| --- | --- |
| STATIC VALIDATION | Filename validation, SQL review, migration diff, RLS/grants and function/RPC review |
| LOCAL DATABASE VALIDATION | Clean migration replay/reset from zero, required seeds/reference fixtures, pre/post invariants, schema introspection and focused affected-domain tests |
| APPLICATION COMPATIBILITY | Affected API/domain tests, typecheck where schema-facing types changed, current application against target schema and migration sequencing compatibility |
| REMOTE/STAGING VALIDATION | Only authorized, necessary checks against the verified environment |
| PRODUCTION VALIDATION | Only separately authorized production/release procedures and evidence |

Follow the master's current CI authority and per-application test model. The migration-governance workflow currently reports a successful no-op for unrelated paths; a green check does not prove migrations were replayed or even that filename validation ran. Inspect the executed steps. Never report DATABASE PASS solely because SQL parses, MIGRATION PASS solely because filenames pass, or PRODUCTION COMPATIBLE without the required compatibility evidence.

Record actual commands/checks, exact SHA, environment, migration versions, results and evidence. Mark anything unrun or inaccessible **NOT VERIFIED**. Historical local baseline reports are context, not a substitute for clean replay of the current active migration chain. This skill's structural validation is not database validation.

SPC-02 is not complete until approved programme evidence supports all four exit gates:

```text
DATABASE: PASS
MIGRATION REPLAY: PASS
RLS / SECURITY: PASS
PRODUCTION COMPATIBILITY: PASS
```

Any unresolved Critical database integrity, migration-history, security or compatibility issue remains a release blocker. Do not skip a dependent critical predecessor. Do not mark SPC-02 Done without corresponding verified tracker evidence. Follow the master's tracker fields and authorization rules; if access is unavailable, report the exact proposed row update and state that it was not made.
