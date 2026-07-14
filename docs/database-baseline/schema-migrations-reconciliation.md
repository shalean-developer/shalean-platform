# Schema migrations reconciliation — Phase 1.11B (F-MIG-001)

**Status:** DOCUMENTATION ONLY — no remote `schema_migrations` writes in this phase  
**Does not rewrite** historical migration SQL under `supabase/migrations-legacy/`

## Problem

| Source | State |
|--------|-------|
| Git active migrations | `20260714010000_production_baseline.sql` + Phase 1.11A–B forward files |
| Production `supabase_migrations.schema_migrations` (audit) | **12** sparse versions (`20260421` … `20261071`), **missing** `20260714010000` |
| Truth of schema | Production catalog **is** the source of the baseline dump |

Production was not rebuilt from the baseline file; the baseline was extracted from production. Forward `supabase db push` / migrate is unsafe until history is intentionally repaired.

## Recorded remote versions (audit 2026-07-14)

| version | name |
|---------|------|
| 20260421 | booking_audit_system_logs |
| 20260511172349 | cleaners_joined_at_repair |
| 20260512065718 | resolve_auth_user_id_by_email_and_link |
| 20260512081348 | bookings_payment_method_chk_add_eft_card |
| 20260512084920 | h5_legacy_completed_payment_status_repair |
| 20260512090115 | h10_cleaner_financial_rls_identity_fix |
| 20260512092414 | h6_h4_user_profiles_backfill |
| 20260512104544 | 20260940_h12_dispute_admin_audit_fields |
| 20260512110146 | 20260941_cron_run_leases |
| 20260512115242 | h14_m19_hot_path_composite_indexes |
| 20261053 | (null name) |
| 20261071 | booking_fulfillment_mode_and_demand |

## Recommended repair strategy (ops — after approval)

Goal: leave production schema untouched; align history so **only** active git migrations matter going forward.

1. **Backup** production (snapshot / PITR confirmed).
2. Re-list remote history:  
   `npx supabase migration list --linked`
3. Use **`supabase migration repair`** (not SQL inventiveness) to mark baseline as applied and retire drift versions per CLI guidance for the installed CLI version (`npx supabase migration repair --help`).
4. Target end state:
   - Remote history includes `20260714010000` as applied.
   - Orphan remote-only versions either repaired as reverted/applied consistently with team policy, or documented as “pre-baseline archaeology” with a written exception.
5. Then apply Phase 1.11A–B forward migrations via approved path (`db push` / migrate) **after** P0–P1 SQL is locally verified.
6. Never move files from `migrations-legacy` back into `migrations` without a separate remediation plan.

## Non-goals of this phase

- No deletion of legacy SQL archives.
- No edit of `20260714010000_production_baseline.sql`.
- No automatic `INSERT` into production `schema_migrations` from git.
