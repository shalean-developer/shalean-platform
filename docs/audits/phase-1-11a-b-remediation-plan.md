# Phase 1.11A–B — Database Health Remediation Package

| Field | Value |
|-------|-------|
| **Phase** | 1.11A–B |
| **Date** | 2026-07-14 |
| **Mode** | Prepare migrations + docs only — **not applied to production** |
| **Baseline untouched** | `20260714010000_production_baseline.sql` |
| **Source audit** | [`phase-1-11-database-health-audit-2026-07-14.md`](./phase-1-11-database-health-audit-2026-07-14.md) |

---

## 1. Findings → change matrix

| Finding | Priority | Change | Artifact |
|---------|----------|--------|----------|
| F-SEC-001 Privileged DEFINER EXECUTE for anon/authenticated | P0 | Revoke anon/authenticated; GRANT EXECUTE to `service_role` only (except allowlist) | `20260714120000_phase_111a_definer_rpc_execute_lockdown.sql` |
| F-SEC-002 `invoke_nextjs_cron` callable by anon | P0 | Included in lockdown + explicit REVOKE/GRANT | same |
| F-SEC-003 Storage 0 policies | P0 | Ensure 4 buckets; deny Storage API for anon/authenticated | `20260714120100_phase_111a_storage_least_privilege_policies.sql` |
| F-MIG-001 schema_migrations drift | P1 | Documented reconciliation runbook (no remote write) | `docs/database-baseline/schema-migrations-reconciliation.md` |
| F-DATA-001 CASCADE financial deletes | P1 | COMMENT audit only; proposed RESTRICT deferred | `20260714120400_…_cascade_fk_audit_comments.sql` + `phase-1-11b-cascade-fk-inventory.md` |
| F-OPS-001 Log retention / bloat | P1 | Config table + batched prune functions; **notification prune gated off** | `20260714120300_phase_111b_log_retention_controls.sql` |
| F-SEC-004 Admin views security definer | P1 | `security_invoker=true` + revoke client grants | `20260714120200_phase_111b_admin_views_security_invoker.sql` |
| F-GOV-001 Formal SEOS standards | P1 | **Not available locally** — no fabricated standards added | See §8 |

---

## 2. Exact affected object inventory

### 2.1 SECURITY DEFINER privileges

| Class | Objects | Post-change EXECUTE |
|-------|---------|---------------------|
| Allowlist anon + authenticated + service_role | `public_review_banner_stats()`, `public_marketing_reviews_for_area(text,integer)` | anon ✓ auth ✓ service ✓ |
| RLS helpers | `user_owns_booking(uuid)`, `user_has_booking_with_cleaner(uuid)` | anon ✗ auth ✓ service ✓ |
| All other `public` SECURITY DEFINER routines (live inventory via `pg_proc.prosecdef`) including `invoke_nextjs_cron(text)`, money/admin RPCs, trigger DEFINER helpers | service_role ✓ only (anon/authenticated/PUBLIC revoked) |

**App evidence for allowlist / service_role-only** documented in remediation research: marketing RPCs use `getSupabaseServer()` (anon key); cleaner accept / payouts / credits / cron locks use `getSupabaseAdmin()`.

### 2.2 Storage

| Bucket | public | Policies added |
|--------|--------|----------------|
| `blog-media` | true | `phase111a_deny_anon_auth_blog_media` |
| `campaign-media` | true | `phase111a_deny_anon_auth_campaign_media` |
| `booking-service-photos` | false | `phase111a_deny_anon_auth_booking_service_photos` |
| `expense-receipts` | false | `phase111a_deny_anon_auth_expense_receipts` |

### 2.3 Admin views → `security_invoker=true`

`admin_booking_promo_costs`, `admin_global_monthly_referral_economics`, `admin_referral_checkout_redemption_summary`, `admin_referral_reconciliation_queue`, `admin_referrer_conversion_rollups`, `admin_referrer_event_rollups`, `admin_referrer_monthly_profitability_rollups`, `admin_referrer_profitability_rollups`, `admin_referrer_quality_signals`, `admin_referrer_redemption_rollups`, `admin_referrer_redemption_spike_flags`, `admin_referrer_reward_rollups`

### 2.4 Retention

| Object | Change |
|--------|--------|
| `public.data_retention_settings` | New table; RLS on; service_role only |
| `prune_notification_logs(integer, integer)` | New; requires `prune_enabled=true` |
| `prune_system_logs(integer, integer)` | Replaced with optional batch; `search_path` preserved; service_role only |

### 2.5 CASCADE (comments only)

See [`phase-1-11b-cascade-fk-inventory.md`](./phase-1-11b-cascade-fk-inventory.md).

---

## 3. New migration files

```text
supabase/migrations/20260714120000_phase_111a_definer_rpc_execute_lockdown.sql
supabase/migrations/20260714120100_phase_111a_storage_least_privilege_policies.sql
supabase/migrations/20260714120200_phase_111b_admin_views_security_invoker.sql
supabase/migrations/20260714120300_phase_111b_log_retention_controls.sql
supabase/migrations/20260714120400_phase_111b_cascade_fk_audit_comments.sql
```

---

## 4. Verification SQL

[`phase-1-11a-b-verification.sql`](./phase-1-11a-b-verification.sql)

---

## 5. Rollback considerations

| Migration | Rollback approach |
|-----------|-------------------|
| DEFINER lockdown | Re-GRANT EXECUTE to anon/authenticated (emergency only — defeats the security fix). Prefer forward fix if a legitimate JWT RPC was missed. |
| Storage policies | `DROP POLICY phase111a_deny_* ON storage.objects;` (returns to zero-policy deny for clients anyway under RLS) |
| Admin views | `ALTER VIEW … SET (security_invoker = false);` + restore prior GRANTs if needed |
| Retention | `DROP FUNCTION prune_notification_logs`; restore prior `prune_system_logs` body from baseline; `DROP TABLE data_retention_settings` |
| CASCADE comments | `COMMENT ON CONSTRAINT … IS NULL;` |

**Do not** roll back by editing the production baseline file.

---

## 6. Risk notes and expected application impact

| Area | Impact |
|------|--------|
| Next.js `getSupabaseAdmin()` `.rpc(...)` | **None expected** — service_role retains EXECUTE |
| Marketing review RPCs via anon server client | **Preserved** |
| Customer RLS using `user_owns_booking` / `user_has_booking_with_cleaner` | **Preserved** for `authenticated` |
| Browser direct `/rest/v1/rpc/admin_*` with anon key | **Blocked** (intended) |
| `pg_cron` → `invoke_nextjs_cron` | **Should continue** (cron role is not anon); verify on staging after apply |
| Storage uploads (blog/campaign/QA/expenses) | **None expected** — service_role bypasses RLS |
| Public CDN URLs for blog/campaign media | **Unaffected** (`buckets.public = true`) |
| notification_logs size | **No delete on migrate**; prune gated until explicitly enabled |
| CASCADE behaviour | **Unchanged** |
| SEOS standards gap | **Unresolved** — artefacts not found locally |

**Regression focus after approved apply:** cleaner offer accept, admin mark payout paid, Paystack transfer mark-paid RPCs, cron invoke (WhatsApp / prune-system-logs), home review banner, location hub reviews, expense receipt upload, booking QA photo upload.

---

## 7. PowerShell commands (local only — do not push remote yet)

```powershell
cd C:\Users\info\shalean-platform

# 1) Validate migration filenames
npm run db:migrations:validate

# 2) Optional: apply locally (resets local DB to baseline + forward migrations)
# npx supabase start   # if not running
npx supabase db reset

# 3) Run verification SQL against LOCAL db
npx supabase db query --local -f docs/audits/phase-1-11a-b-verification.sql

# STOP — do not run against production until approval:
# npx supabase db push --linked
# npx supabase migration list --linked
```

---

## 8. SEOS standards (F-GOV-001)

Searched repo and project paths for formal:

- Shalean Engineering Standards  
- Architecture Standards  
- Security Engineering Standard  
- Data Governance Standard  
- Definition of Done  

**Result: not present locally.** No placeholder “fake standards” were invented. Closest existing artefacts remain `supabase/ARCHITECTURE.md`, `docs/database-baseline/migration-governance.md`, and prior SEOS audits under `docs/audits/`.

---

## 9. Approval gate

Awaiting approval before:

1. Local `db reset` verification (optional but recommended)  
2. Any `migration repair` on production history  
3. Any remote apply of Phase 1.11A–B SQL  
4. Enabling `notification_logs.prune_enabled` or scheduling notification prune cron  
5. High-lock CASCADE → RESTRICT migrations  
