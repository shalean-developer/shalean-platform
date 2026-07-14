# Phase 1.11C — Pull Request Review Report

| Field | Value |
|-------|-------|
| **Review date** | 2026-07-14 |
| **Branch** | `fix/database-phase-111-security-hardening` |
| **Initial commit reviewed** | `ef1e814a` (`ef1e814a2e926d39de0658b7945494f8351a43a5`) |
| **Follow-up hardening** | Verification + hygiene (M01/M02/M03/L01/L02) — see § Follow-up resolution |
| **Base compared** | `origin/main` (merge-base `01312867`) |
| **Review mode** | Local Supabase only; **no remote migration apply** |
| **Reviewer** | Cursor PR review agent |

---

## Executive Summary

| Item | Result |
|------|--------|
| Branch | Confirmed: `fix/database-phase-111-security-hardening` |
| Initial review HEAD | `ef1e814a` — **APPROVE WITH NON-BLOCKING FOLLOW-UP** |
| Follow-up | Verification hardened; `_tmp_definer_sigs.txt` removed |
| Local migration replay | **Passed** (`npx supabase db reset`) |
| Migration governance validate | **Passed** (`npm run db:migrations:validate`) |
| Phase 1.11C verification SQL | **Passed** after hardening (full 118-table set + retained DML + exact WhatsApp identities) |
| Negative verification tests | **Passed** (deliberate violations fail; clean reset restores PASS) |
| Backend client compatibility (static) | **Passed** — service-only tables via `getSupabaseAdmin()` / service_role |
| Overall conclusion | Merge-ready; remote apply still blocked by H01 |
| Recommended PR decision | **`APPROVE`** |

**Important:** Local pass does **not** mean development/staging/production databases are secured. Remote apply remains explicitly unapproved. Production migration history is known to diverge from the active git migration set (`docs/database-baseline/schema-migrations-reconciliation.md`).

### Readiness scores (after follow-up)

| Gate | Score | Notes |
|------|------:|-------|
| **PR merge readiness** | **92 / 100** | Verification gaps M01–M03/L01–L02 closed; residual M04/L03/L04/H01 remain non-merge or deploy-only |
| **Development/staging apply readiness** | **55 / 100** | Package is sound locally; still needs explicit apply approval + history check per env |
| **Production apply readiness** | **30 / 100** | **Blocked** by PR-111C-H01 (schema_migrations drift) until repair + explicit production approval |

---

## Changed File Inventory

Branch delta vs `origin/main`: **18 files**, **+2046 / −0** (additive). Commits on branch:

1. `1b945a18` — Phase 1.11A–B hardening  
2. `a7bb5603` — Phase 1.11C least-privilege grants  
3. `ef1e814a` — tighten 1.11C revokes + fail-closed verification  

| File | Purpose | In Scope | Risk |
|------|---------|---------:|------|
| `supabase/migrations/20260714120000_phase_111a_definer_rpc_execute_lockdown.sql` | Revoke client EXECUTE on privileged SECURITY DEFINER RPCs; allowlist marketing/RLS helpers | Yes (1.11A in same branch) | Medium — could break any unexpected client RPC call |
| `supabase/migrations/20260714120100_phase_111a_storage_least_privilege_policies.sql` | Ensure buckets; deny Storage API for anon/authenticated | Yes (1.11A) | Low — service_role bypasses RLS; CDN public buckets unchanged |
| `supabase/migrations/20260714120200_phase_111b_admin_views_security_invoker.sql` | Admin views → `security_invoker`; revoke client SELECT | Yes (1.11B) | Low |
| `supabase/migrations/20260714120300_phase_111b_log_retention_controls.sql` | Retention settings table; prune RPCs fail-closed when disabled | Yes (1.11B) | Low (no mass delete on apply) |
| `supabase/migrations/20260714120400_phase_111b_cascade_fk_audit_comments.sql` | COMMENT-only CASCADE FK audit | Yes (1.11B) | None (metadata) |
| `supabase/migrations/20260714130000_phase_111c_revoke_service_role_only_table_grants.sql` | REVOKE ALL from anon/authenticated on ~95 service-only tables; GRANT ALL to service_role | Yes (1.11C) | Medium — 42501 if missed client path |
| `supabase/migrations/20260714130100_phase_111c_strip_dangerous_client_table_privileges.sql` | Strip TRUNCATE/REFERENCES/TRIGGER/MAINTAIN; sequence + WhatsApp helpers lockdown | Yes (1.11C) | Low |
| `supabase/migrations/20260714130200_phase_111c_default_privileges_hardening.sql` | Stop auto-GRANT ALL to anon/authenticated for future objects | Yes (1.11C) | Medium — future migrations must GRANT deliberately |
| `docs/audits/phase-1-11-database-health-audit-2026-07-14.md` | Source audit (F-SEC-001…007) | Yes | None |
| `docs/audits/phase-1-11a-b-remediation-plan.md` | A/B remediation plan | Yes | None |
| `docs/audits/phase-1-11a-b-verification.sql` | A/B verification queries (mostly informational SELECT) | Yes | None (docs) |
| `docs/audits/phase-1-11b-cascade-fk-inventory.md` | CASCADE inventory | Yes | None |
| `docs/audits/phase-1-11c-privilege-audit-remediation-2026-07-14.md` | 1.11C privilege audit / remediation | Yes | None |
| `docs/audits/phase-1-11c-verification.sql` | Asserting verification DO block | Yes | None |
| `docs/database-baseline/schema-migrations-reconciliation.md` | Remote history drift / repair (docs only) | Yes | High **for remote apply**, not for merge |
| `docs/registers/risk-register-phase-111c-privileges.md` | RISK-DB-009…011 | Yes | None |
| `docs/registers/technical-debt-phase-111c-privileges.md` | DEBT-DB-004/013/014 | Yes | None |
| `docs/audits/_tmp_definer_sigs.txt` | Temporary DEFINER signature dump | Was borderline | **Removed** in follow-up (L02) |
| `docs/audits/phase-1-11c-pr-review-2026-07-14.md` | This PR review report | Yes | None |

**Unexpected / hygiene**

- ~~Committed: `docs/audits/_tmp_definer_sigs.txt`~~ — **deleted** in verification-hardening follow-up (L02 resolved).  
- No unrelated application, feature, UI, pricing, payment, or infrastructure code in the privilege/migration package.

---

## Findings

### Critical

*None.*

### High

*None that block merge of the prepared migration package.*

| ID | Title | Severity | File / line | Evidence | Impact | Remediation | Blocks merge? |
|----|-------|----------|-------------|----------|--------|-------------|---------------|
| PR-111C-H01 | Remote schema_migrations drift blocks safe `db push` | High (deploy) | `docs/database-baseline/schema-migrations-reconciliation.md` | Production history lists 12 sparse versions; baseline `20260714010000` missing remotely | Blind push can desync or re-apply large baseline | Explicit `migration repair` + approval gate **before** any remote apply | **No** for merge; **Yes** for remote apply |

### Medium

| ID | Title | Severity | Status | Original evidence | Resolution |
|----|-------|----------|--------|-------------------|------------|
| PR-111C-M01 | Verification samples subset of service-only revoke list | Medium | **Resolved** | Asserted ~14 tables vs full revoke set | `phase-1-11c-verification.sql` now mirrors full `…130000` `service_only` (**118** tables); asserts anon/authenticated/**PUBLIC** privileges; length guard `< 90` fails if list shrinks |
| PR-111C-M02 | Missing service-only tables skipped in verification | Medium | **Resolved** | `CONTINUE` when missing | Required tables raise `required service-only table missing: public.%`; bookings + protected finance + marketing/customer retained tables also must exist |
| PR-111C-M03 | Client DML retention no longer asserted | Medium | **Resolved** | Positive DML checks removed in `ef1e814a` | Restored retained-privilege matrix (bookings DML; monthly_invoices/cleaner_* SELECT; marketing anon SELECT; customer SELECT; addresses CRUD) |
| PR-111C-M04 | Default-privilege change requires migration author discipline | Medium | **Open** (non-blocking) | Future objects need explicit GRANT | Tracked as RISK-DB-011 — no change in this follow-up |

### Low

| ID | Title | Severity | Status | Original evidence | Resolution |
|----|-------|----------|--------|-------------------|------------|
| PR-111C-L01 | WhatsApp `function_count <> 2` does not enforce distinct names | Low | **Resolved** | Bare count could pass on overloads | Exact identities via `pg_get_function_identity_arguments`: `get_pending_whatsapp_jobs(limit_count integer, max_delivery_attempts integer)` and `get_whatsapp_queue_status_metrics()`; still requires exactly 2 public signatures under those names |
| PR-111C-L02 | Committed `_tmp_definer_sigs.txt` | Low | **Resolved** | TMP artifact in audits tree | `git rm docs/audits/_tmp_definer_sigs.txt` — no references in repo |
| PR-111C-L03 | Storage “deny” policies are PERMISSIVE `USING (false)` | Low | **Open** (out of scope) | Future RLS design | Deferred — do not alter storage semantics in this follow-up |
| PR-111C-L04 | Customer tables still hold broad INSERT/UPDATE/DELETE (by design) | Low | **Open** (out of scope) | DEBT-DB-013 | Deferred — not redesigned here |

### Informational

| ID | Title | Severity | Evidence |
|----|-------|----------|----------|
| PR-111C-I01 | Branch includes 1.11A + 1.11B + 1.11C | Informational | Three commits; all SQL privilege/security related |
| PR-111C-I02 | `REVOKE … FROM PUBLIC` removed in `ef1e814a` | Informational | Local spot-check: `public` table grantee count = **0**; revoking only anon/authenticated is sufficient for current baseline |
| PR-111C-I03 | Lint exit 1 / m18 migration path test fail are unrelated | Informational | Pre-existing UI lint errors; `m18CleanerPayoutsUniquePeriod` expects legacy migration path moved into baseline |
| PR-111C-I04 | Working tree had untracked reviewer spot-check SQL | Informational | `docs/audits/_tmp_pr_review_priv_spotcheck.sql` — not committed |

---

## Verification Results

### Git status

```text
On branch fix/database-phase-111-security-hardening
Your branch is up to date with 'origin/fix/database-phase-111-security-hardening'.
HEAD: ef1e814a2e926d39de0658b7945494f8351a43a5
Untracked: docs/audits/_tmp_pr_review_priv_spotcheck.sql (reviewer-only)
Committed working tree otherwise clean relative to HEAD.
```

### Migration validation

```text
Command: npm run db:migrations:validate  (repo root)
Result: db:migrations:validate PASS
SQL files: 9 | Timestamps: 9 unique
WARN: Ignoring archive directory supabase\migrations-legacy
```

### Local database reset

```text
Commands: npx supabase start ; npx supabase db reset
Result: Finished supabase db reset
Applied (in order):
  20260714010000_production_baseline.sql
  20260714120000 … 20260714120400 (1.11A–B)
  20260714130000 … 20260714130200 (1.11C)
Notices: DROP POLICY IF EXISTS skip notices for new storage policies (expected first apply)
WARN: no files matched pattern: supabase/seed.sql
Stopped services note: imgproxy + pooler stopped (local env; did not block reset)
```

### Verification SQL

```text
Command: npx supabase db query --local -f docs/audits/phase-1-11c-verification.sql
Result: DO ; exit code 0 (PASS)
```

### Manual privilege spot-check (local)

| Check | Result |
|-------|--------|
| anon SELECT `admin_api_idempotency` | false |
| authenticated SELECT `whatsapp_queue` | false |
| service_role SELECT `whatsapp_queue` | true |
| anon/authenticated SELECT `bookings` | true |
| anon TRUNCATE `bookings` | false |
| authenticated SELECT `monthly_invoices` | true |
| authenticated SELECT `cleaner_earnings` | true |
| anon SELECT `cities` | false (intended; API uses admin) |
| dangerous client privs (TRUNCATE/REFERENCES/TRIGGER/MAINTAIN) on public | **0** |
| anon/authenticated grants on `admin_api_idempotency` | **0** |
| `PUBLIC` role table grants in public | **0** |
| RLS enabled on bookings / monthly_invoices / cleaner_* / admin_api_idempotency / whatsapp_queue | **true** |
| default ACL anon/authenticated for postgres@public | **none** (service_role retains) |

### Relevant tests

| Command | Result |
|---------|--------|
| `apps/web` `npm run test:critical` | **34/34 passed** |
| `m9PermanentResendFailureBreaker` | **Passed** (15 tests in that file’s run context with sibling suite) |
| `m18CleanerPayoutsUniquePeriod` | **Failed** — `ENOENT` for `supabase/migrations/20260945_m18_…sql` (path obsolescence vs baseline; **unrelated** to 1.11C) |

### Lint / typecheck / build

| Command | Result |
|---------|--------|
| `apps/web` `npm run typecheck` | **Passed** (exit 0) |
| `apps/web` `npm run lint` | **Failed** — 2 errors + 288 warnings; sample error `prefer-const` in unrelated app code; **not introduced by this branch** (branch is SQL/docs only) |
| `npm run build` | **Not run** — no application code changes; typecheck covers TS surface; build would only restate unrelated app noise |

---

## Security Review

### Privilege matrix (summary)

| Surface | Before (baseline) | After 1.11A–C (local) |
|---------|-------------------|------------------------|
| Privileged DEFINER RPC EXECUTE by anon | Yes (critical) | No (except marketing allowlist) |
| `invoke_nextjs_cron` EXECUTE by anon | Yes | No — service_role only |
| Admin referral views security_invoker | false | true + client REVOKE |
| Service-only ops tables GRANT to anon/auth | ALL incl. TRUNCATE | **Revoked** |
| Customer tables DML for anon/auth | ALL | DML retained; dangerous stripped |
| `bookings_reference_seq` client USAGE | Yes | No |
| Default privileges → anon/auth | ALL | Revoked; service_role/postgres kept |
| RLS on protected tables | Enabled | Remains enabled; not disabled |
| FORCE RLS | Off | Unchanged (documented debt) |

### Sensitive-table access review

| Table | In REVOKE-ALL list? | Client access | Backend path |
|-------|--------------------:|---------------|--------------|
| `bookings` | No | Browser/hooks retain SELECT/DML under RLS | Admin APIs / payment finalize via `getSupabaseAdmin()` |
| `monthly_invoices` | No | `hooks/useMonthlyInvoices.ts` via user client | Charge/cron/admin via admin |
| `cleaner_earnings` | No | Dangerous priv stripped only; authenticated SELECT remains for RLS UX | Admin / cleaner earnings APIs use admin |
| `cleaner_payment_details` | No | Same | `/api/cleaner/payment-details` admin |
| `cleaner_payouts` | No | Same | Payout runs/APIs admin |
| `admin_*`, `whatsapp_queue`, `cron_*`, `payout_transfers`, etc. | **Yes** | No in-repo browser `.from()` | `getSupabaseAdmin()` / edge service_role |

Static review found **no BREAKING** browser/`getSupabaseServer` path against the revoke-all set. `cities` revoked from clients but `/api/cities` and booking helpers use admin.

### Backend client review

- Privileged workflows consistently use `getSupabaseAdmin()` (`apps/web/lib/supabase/admin.ts`) with `SUPABASE_SERVICE_ROLE_KEY`.
- Missing admin env returns `null` / 503 path helpers — does **not** fall back to anon for privileged tables.
- No evidence that revoked tables require anon/authenticated table grants for production app paths.

### Fail-closed verification

| Item | Detail |
|------|--------|
| Original gap | WhatsApp privilege `FOR` loop ran zero times if functions missing → verification could still NOTICE PASS; earlier SELECT-only verification had no `RAISE EXCEPTION` |
| Fix (`ef1e814a`) | Asserting `DO` block; `function_count <> 2` raises before privilege loop |
| Why fail-closed | Missing/extra functions or client EXECUTE → `RAISE EXCEPTION` → non-zero `db query` exit |
| Residual edge | `function_count` without distinct names (PR-111C-L01); missing service-only tables skipped (PR-111C-M02) |

### RLS and policy review

- Migrations do **not** disable RLS and do **not** create policy bypasses.
- 1.11B retention prune requires `prune_enabled=true` or raises (fail-closed delete gate).
- Storage policies deny client Storage API for named buckets; public CDN behavior remains bucket `public` flag (documented).

### Default privilege review

- Local post-reset: no postgres@public default grants to anon/authenticated; service_role retains default table/sequence/function grants.
- Types default privileges intentionally out of scope (documented).

---

## Deployment Risk Assessment

### Classification of Phase 1.11C migrations

**Restrictive but backward compatible** with current repository backends that use `service_role` for ops tables; **potentially breaking** for any unknown external PostgREST client calling revoked tables with the anon key (intentional security outcome).

| Aspect | Assessment |
|--------|------------|
| Active backend needs revoked privs? | No (admin/service_role retained) |
| Cron / webhooks / edge | Expect service_role — preserved |
| Connection pooling / role | Unchanged roles |
| Existing sessions | New privilege checks apply immediately after apply |
| Transactional | Each migration wrapped in `BEGIN`/`COMMIT` |
| Rollback | Requires explicit reverse GRANTs (documented); app rollback alone insufficient if privileges already revoked |
| Reverse migration prepared? | Documented rollback notes only — no automated down migration |

### Development / staging risk

Medium until smoke tests pass. Highest residual: unnoticed client path on a revoked table → HTTP/PostgREST `42501`. Mitigate with checklist in remediation §7.

### Production risk

**High until migration history repaired.** Do not treat local success as production-complete. Follow reconciliation doc before any production apply.

### Required monitoring (post-staging apply)

- PostgREST / API 42501 / permission-denied rates  
- Cron success for WhatsApp drain, payout, invoice, notification paths  
- Admin booking create idempotency  
- Marketing/home page loads (blog, locations, services, pricing)  
- Account monthly invoices list  

### Recommended deployment order (do not execute in this review)

```text
1. Merge PR (after optional hygiene follow-ups)
2. Explicit development/staging migration approval
3. Repair staging migration history if needed
4. Apply forward migrations only (1.11A→C) — never baseline re-apply on live data
5. Run phase-1-11c-verification.sql (+ prefer A/B verification)
6. Backend smoke: cities API, newsletter, bookings hooks, invoices, cleaner earnings API, payout dry-run paths, WhatsApp worker
7. Monitor 24h
8. Explicit production approval + backup/PITR
9. Production history repair → apply → verify → monitor
```

### Staging verification plan (not executed)

1. Snapshot / confirm PITR.  
2. `migration list` vs git active set; repair per reconciliation doc.  
3. Apply `20260714120000`…`20260714130200` only.  
4. Run `docs/audits/phase-1-11c-verification.sql`.  
5. Smoke: `GET /api/cities`, newsletter subscribe, account invoices, admin booking create, cleaner earnings endpoints, cron invoke paths with service role.  
6. Negative tests: anon JWT `SELECT` on `admin_api_idempotency` / `whatsapp_queue` / RPC `invoke_nextjs_cron` → denied.  
7. Confirm no `TRUNCATE` for authenticated on `bookings`.  

---

## Documentation governance check

| Claim required | Doc accuracy |
|----------------|--------------|
| What was found / remediated | Accurate in 1.11C remediation + audit |
| Tables / roles affected | Accurate; service-only list in migration |
| Verification method | Accurate; local commands documented |
| Remaining risks | RISK-DB-010/011, DEBT-DB-013/014 present |
| Remote not applied | Explicitly stated; approval gate present |
| Production not secured yet | Stated / implied; this review reaffirms |
| Rollback not guaranteed | Rollback via reverse GRANT documented; no false “tested rollback” claim |

Minor: remediation §9 still says “awaiting approval before local reset” while local reset has now been completed in prior work and again in this review — update stale gate wording in a follow-up commit if desired.

---

## Follow-up resolution (2026-07-14 verification hardening)

| Finding | Resolution | Evidence |
|---------|------------|----------|
| M01 | Full 118-table revoke set + PUBLIC checks | `docs/audits/phase-1-11c-verification.sql` §1; list equals `…130000` |
| M02 | Missing required tables → `RAISE EXCEPTION` | No `CONTINUE` for required service-only / finance / marketing / customer tables |
| M03 | Retained client DML matrix restored | §3b bookings/monthly_invoices/cleaner_*/marketing/customer asserts |
| L01 | Exact WhatsApp function identities | `pg_get_function_identity_arguments` + `found_count <> 2` overload guard |
| L02 | TMP artifact removed | `git rm docs/audits/_tmp_definer_sigs.txt` |

### Follow-up verification commands

```text
npm run db:migrations:validate          → PASS
npx supabase db reset                   → PASS
npx supabase db query --local -f docs/audits/phase-1-11c-verification.sql → PASS (exit 0)
apps/web npm run test:critical          → 34/34 PASS
apps/web npm run typecheck              → PASS
```

### Negative tests (disposable local DB; reset after each)

| Mutation | Expected | Actual |
|----------|----------|--------|
| `GRANT SELECT ON public.admin_api_idempotency TO anon` | fail | `phase_111c FAIL: … privileges on service-only tables: admin_api_idempotency/anon=SELECT` (exit 1) |
| `REVOKE SELECT ON public.bookings FROM authenticated` | fail | `phase_111c FAIL: required retained client privileges missing … bookings/authenticated=SELECT` (exit 1) |
| `DROP FUNCTION public.get_whatsapp_queue_status_metrics()` | fail | `phase_111c FAIL: expected WhatsApp function missing: public.get_whatsapp_queue_status_metrics()` (exit 1) |
| Final `db reset` + clean verify | pass | PASS (exit 0) |

---

## PR Decision

### Initial review (`ef1e814a`): `APPROVE WITH NON-BLOCKING FOLLOW-UP`

### After verification hardening: **`APPROVE`**

**Evidence for approval**

- Correct branch; SQL/docs-only security package.  
- Migration ordering/governance validate PASS; local empty-DB replay PASS.  
- Privilege changes match least-privilege intent; service_role retained; no RLS disable.  
- Backend static analysis: no confirmed client dependency on revoked grants.  
- Verification fail-closed for full revoke set, retained client DML, and exact WhatsApp identities.  
- Negative mutation tests prove verification fails on insecure state.  
- Hygiene: `_tmp_definer_sigs.txt` removed.

**Remaining non-merge / out-of-scope items**

- **H01** — remote migration history drift blocks production apply (not merge).  
- **M04** — future GRANT discipline (RISK-DB-011).  
- **L03 / L04** — storage restrictiveness / DEBT-DB-013 (explicitly deferred).

**Not approved by this review**

- Development / staging / production migration apply  
- Production security “complete” claim  

---

## Reviewer certification

- No remote Supabase project was linked for migration apply.  
- No `supabase db push`, remote `migration up`, migration repair, or environment deploy was executed.  
- No application behavior changes were made for this follow-up (verification + docs + tmp deletion only).  
- Commit `ef1e814a` was not amended, squashed, or force-pushed; follow-up is a new commit.

*End of Phase 1.11C PR review report.*
