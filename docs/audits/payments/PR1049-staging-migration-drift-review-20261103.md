# PR #1049 — Shalean staging migration drift review (2026-11-03)

## Environment and policy
- Parent production: `paqjwfulwywtsyyvdxrq`; staging branch: `uwvnmluiqbczeduzjgse`.
- Branch status `MIGRATIONS_FAILED`; database `ACTIVE_HEALTHY`.
- This is a read-only investigation. No reset/rebase/merge/repair of migration history; no schema or payment writes.

## History comparison
- Production recorded **84** migrations; staging recorded **205**.
- **50** migration names are shared; only **18** have the exact same version; **32** share names but use different versions.
- **34** production migration names were not present by exact name on staging; staging has **155** additional names, many bootstrapped with `bootstrap_...`. A missing migration *name* is not proof that its schema effect is missing.
- Production latest recorded migration: `20261101113826 zoho_expense_period_mirror`; staging latest: `20261020190530 blog_scheduler_isolated_vault_target`.
- Both presently have `monthly_invoices_status_check` without `void`.

## Historical PostgreSQL evidence
- The staging PostgreSQL logs for **2026-10-05 06:16:47–06:16:49 UTC** show SQLSTATE `42P01` (undefined relation) on `supabase_migrations.schema_migrations` reads, followed by `42P01` on a service-pricing synchronization statement using `public.services` and `public.pricing_services`. The pricing statement failed again at **06:25:14 UTC**.
- Both tables and `supabase_migrations.schema_migrations` exist **today**, so these are bootstrap-time errors rather than proof of current absence.
- The historical log excerpt does **not identify a definitive failed migration name or immutable deployment job ID**. Treat attribution to the `MIGRATIONS_FAILED` branch status as probable, not confirmed.

## Classification and gate
- Same name/same version: **18 candidates** for equivalent history (SQL content hashes not compared).
- Same name/different version: **32 requires SQL-body comparison** before declaring equivalent.
- Production-only names: **34 requires object-level assessment** to separate bootstrap equivalence from genuinely missing effects.
- Staging-only names: **155 requires bootstrap/branch-only classification**.
- No migration history manual fix or `void` deployment is safe solely on these counts.

## Required follow-up
1. Locate the Supabase branch build/migration failure detail in the branch deployment UI or official job logs, showing failed migration name and error.
2. Compare the applied migration SQL bodies and relevant schema objects for dependencies of PR #1049.
3. Confirm no incompatible pending migration applies before the new versioned `void` status migration.
4. Apply through the established tracked staging migration pipeline, then inspect the actual constraint and application checkout/reminder/receivable behavior.
5. Maintain PR #1049 Draft and production NO-GO until staging verified and owner approval obtained.
