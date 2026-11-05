# EMAIL-STG-01 — Marketing consent staging migration and rollback readiness

Status: **PREPARED / HOLD — NO MIGRATION APPROVED OR APPLIED**
Date: 2026-11-05
Canonical tracker: https://github.com/shalean-developer/shalean-platform/issues/1076
Source PR: https://github.com/shalean-developer/shalean-platform/pull/1074
Staging-only project ref: `uwvnmluiqbczeduzjgse`
**Never** use Shalean production project `paqjwfulwywtsyyvdxrq` for this task.

## Read-only diagnosis

- Supabase development branch `staging` has `MIGRATIONS_FAILED` metadata, last updated 2026-10-05, while its preview database is `ACTIVE_HEALTHY`. The historical exact failed statement is **not identified**.
- PostgreSQL read-only SQL succeeded. The staging ledger contains 206 migration versions, latest `20261102214000 monthly_invoice_void_status` (later than the stale branch metadata). Production and staging migration histories diverge and include staging bootstrap renames. **Do not reset/rebase/replay production migrations to 'repair' the branch state.**
- The candidate version `20261104210000` is not recorded.
- `public.marketing_email_consent_events`, `public.marketing_email_reconciliation_jobs`, and `public.marketing_email_enrollment_jobs` do not exist.
- Required `public.user_profiles` columns `id`, `role`, `billing_email`, `marketing_emails_unsubscribed_at` exist. Required roles `anon`, `authenticated`, `service_role` exist; `pgcrypto` present.
- Disposable native PostgreSQL 17 migration and RLS assertions have passed on earlier exact PR heads. Latest-head PR CI must be rechecked immediately before execution.

## Approval gate — required BEFORE any staging SQL write

1. Owner explicitly approves **only** migration `supabase/migrations/20261104210000_marketing_email_consent_ledger.sql` on project `uwvnmluiqbczeduzjgse`, with no historical data backfill or Resend activation.
2. Exact current PR source SHA recorded; latest-head web-test/Vitest, native PostgreSQL, migration governance, MASTER-00B and RBAC workflows all green. A new commit resets this gate.
3. Staging project ref and scope checked a second time. Never mutate the parent production project.
4. Independent staging pre-migration snapshot/recovery method verified (backup or an approved export with tested restore). No assumption that the Supabase development branch has recoverable backups.
5. Operator reviews the exact SQL, constraints, RLS/grants, immutability trigger and migration order. No migration drift or existing table collision.
6. Runtime safety: staging Resend contact writes blocked even with credentials; cron unscheduled; webhook disabled; outbound email/SMS disabled; Paystack test-only. Plesk private runtime variables independently verified, not inferred from public build variables.

## Bounded staging-only execution (FUTURE; NOT RUN)

- Use the Supabase migration facility against the exact staging ref, with migration name corresponding to `20261104210000_marketing_email_consent_ledger.sql`. Do not execute on production and do not edit prior migration history.
- Read back `to_regclass` for the three tables, `supabase_migrations.schema_migrations` version, RLS flags, unprivileged grants and immutability trigger. Verify default-zero user content (unless later explicitly authorised synthetic fixtures), and that no old customer was silently opted in.
- Never run `supabase/tests/marketing_email_consent_isolated_native.sql` against the shared staging database: it inserts and rolls back synthetic rows but contains assumptions of an otherwise empty disposable DB. Run that fixture on disposable PostgreSQL only.
- Test the staging API with approved synthetic staging identities and provider writes blocked. Confirm consent recorded vs provider enrollment pending, opt-out preserved, essential email pathways safe.
- After owner authorisation, separately merge reviewed PR to `main` to invoke existing prebuilt Plesk staging publishing workflow. This updates compiled artifact branch `deploy/staging`; it is not a source merge target. Confirm exact source SHA in `release-sha.txt`, Plesk health SHA, and host `https://pricing-test.shalean.co.za`.

## Rollback and recovery

**Before execution** record existing source/runtime deployment SHA and verified database restore method. A failed migration must stop the release. Prefer forward repair of isolated schema failures with evidence; do not blindly delete migration history, reset/rebase the staging branch or drop tables containing consent/withdrawal evidence.

If the new migration fails:
1. Preserve exact error and schema state. Stop deployment and provider interactions.
2. If database reports no migration version, verify whether any partial objects exist. Do not assume SQL was atomic.
3. If migration committed and the new app is faulty, roll back **application artifact** to the previously verified compiled Plesk staging bundle, keep new private tables and historic data intact, and assess forward repair.
4. Only contemplate schema rollback after confirming all three tables have **zero rows**, no other dependencies, and a tested recovery snapshot. Any destructive rollback requires separate explicit owner approval and an exact SQL review; no blanket `DROP ... CASCADE`.
5. Confirm staging health, customer/transactional route safety and absence of external sends. Leave production untouched.

## Current decision

**NO-GO for schema execution and staging deployment** until the above approval and evidence gates are satisfied. No source merge, database mutation, Plesk activation, webhook activation or Resend contact write authorised by this document.
