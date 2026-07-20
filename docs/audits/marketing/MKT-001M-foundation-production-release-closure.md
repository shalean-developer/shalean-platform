# MKT-001M — Foundation Production Release Closure

**Date:** 2026-07-20  
**Authorization phrase:** `approve foundation production release`  
**Approved tree SHA:** `c052c315b8cfcb61fb1e397a3e4d0888728ef4e6`  
**Merge commit on `main`:** `0e958bbd596402e07f838509c941ad53b220da1e`  
**PR:** [#71](https://github.com/shalean-developer/shalean-platform/pull/71) **MERGED**  
**Scope:** Provider-disabled foundation only (no Meta Live / no provider activation)

---

## Outcome

### **FOUNDATION RELEASE COMPLETE — PROVIDERS REMAIN DISABLED**

---

## Identity

| Item | Value |
|---|---|
| Production Supabase | `shalean-platform` / `tchayecuvzssixyxlvfu` |
| Vercel Production deploy | `HPtJGciRzRUA8WdQrUa6Dg4QpdhZ` |
| GitHub Production deployment id | `5525573947` |
| Deployed git SHA (health) | `0e958bbd596402e07f838509c941ad53b220da1e` |
| Prior production / rollback SHA | `ad5b4ccb242f2e1a3c4a98edf421820324a8e18e` |
| Evidence directory | `C:\Users\info\release-evidence\mkt-001m\20260720T164234Z` |

---

## Legal conditions (unchanged)

`CONDITIONAL PASS — foundation release with all providers disabled`

Live/counsel blockers remain open (entity, lawful bases, cross-border inventory, retention, durable deletion ledger, completion evidence, Information Officer, App Review wording). **Do not** enable Meta Live or providers until those close.

---

## Provider state

| Flag | Required | Notes |
|---|---|---|
| `MARKETING_PROVIDER_FACEBOOK` | `0` / unset | Fail-closed in code |
| `MARKETING_PROVIDER_INSTAGRAM` | `0` / unset | |
| `MARKETING_PROVIDER_X` | `0` / unset | |
| `MARKETING_PROVIDER_GOOGLE_BUSINESS` | `0` / unset | |
| `MARKETING_PROVIDER_LINKEDIN` | `0` / unset | |
| `MARKETING_PROVIDER_PINTEREST` | `0` / unset | |

**Operator follow-up:** Confirm explicit `0` values in Vercel Production UI (this executor’s Vercel CLI was not scoped to `shalean-cleaning-services`). No OAuth credentials were added for this release. No provider connections performed.

---

## Backup gate

| Step | Result |
|---|---|
| Physical backup latest | id `1158177792` @ `2026-07-20T00:36:29.488Z` COMPLETED |
| PITR | **Disabled** (`pitr_enabled: false`); `walg_enabled: true` |
| Roles | `pg_dumpall --roles-only --no-role-passwords` → `01-roles.sql` (5786 B) |
| Schema | `pg_dump -Fc --schema-only --role=postgres --schema=public,supabase_migrations` → `02-schema.dump` (1008807 B) |
| Data | `pg_dump -Fc --data-only --role=postgres --schema=public,supabase_migrations` → `03-data.dump` (34615592 B) |
| Roles validation | SQL readable; 17 `CREATE ROLE` |
| Custom validation | `pg_restore --list` OK (schema 2091 lines; data 192 lines); bookings/promotions/social_accounts present |
| Encryption | OpenSSL AES-256-CBC PBKDF2 200k; decrypt round-trip OK |
| Checksums | `SHA256SUMS-encrypted.txt` + plaintext hashes recorded |

Baseline counts (no PII): bookings=446, promotions=7, social_accounts=0, social_publish_history=0, cleaners=30.

---

## Migration gate

| # | Version | Result | Notes |
|---|---|---|---|
| 1 | `20260716180000` | **PASS** | `public_active_promotions`; anon/authenticated SELECT on `promotions` = false |
| 2 | `20260716180100` | **PASS** | `marketing_publish_idempotency` |
| 3 | `20260717120000` | **PASS (repaired)** | Core table/functions COMMIT’d; post-COMMIT cron schedule failed on nested `$$` quoting; repaired with `$cron$…$cron$`; job `social-publish-jobs` `*/5 * * * *` |
| 4 | `20260717180000` | **PASS** | CHECK includes `instagram` |
| 5 | `20260718120000` | **PASS** | CHECK includes `x` |

Post-verify: all five history rows present; `social_publish_jobs` count=0; no anon SELECT on new tables; bookings still 446 / promotions 7.

**Follow-up (non-blocking):** fix nested dollar-quotes in `20260717120000_mkt_001b2_social_publish_jobs.sql` for future fresh applies (production already repaired).

---

## Merge / deploy

| Step | Result |
|---|---|
| PR #71 undraft + merge | MERGED `2026-07-20T16:53:53Z` |
| `main` contains approved tree | Yes (`c052c315` ancestor of `0e958bbd`) |
| Vercel Production | SUCCESS `HPtJGciRzRUA8WdQrUa6Dg4QpdhZ` |
| `/api/health/environment` | status=ok, deployment=production, ref=`tchayecuvzssixyxlvfu` |

---

## Production verification

| Check | Result |
|---|---|
| `/` | 200 |
| `/privacy` | 308 → `/privacy-policy` |
| `/privacy-policy` | 200 (IR + social copy) |
| `/data-deletion` | 200 (acknowledgement copy) |
| `/data-deletion/status` | 200 |
| `/terms-of-service` | 200 |
| Invalid Meta callback | 400 |
| Ten location short-slugs | 200 → `/locations` |
| `/quote` | 200 |
| Live internal links workflow | **PASS** [run 29761934994](https://github.com/shalean-developer/shalean-platform/actions/runs/29761934994) |
| Publish jobs | 0 rows |
| Providers | Remain disabled (fail-closed) |

Valid Meta deletion callback **not** submitted (per approval).

---

## Not authorized / not done

- Meta Live / App Review Live switch  
- Any `MARKETING_PROVIDER_*=1`  
- Provider OAuth connect / publishing  
- Adding production OAuth secrets for enablement  

---

## Rollback reference

1. Force all `MARKETING_PROVIDER_*=0`  
2. Redeploy `ad5b4ccb242f2e1a3c4a98edf421820324a8e18e` if app rollback required  
3. DB: prefer leave forward migrations; restore from encrypted logical dumps only if authorized (PITR unavailable)

---

## Migration apply runbook (dollar-quote / atomic SQL)

**Root cause (MKT-001M migration 3):** Invalid nested dollar-quoting in committed SQL — `DO $$ … PERFORM cron.schedule(…, $$…$$); … $$;` uses the same `$$` tag for outer and inner quotes. PostgreSQL closes the outer string at the first inner `$$`, so a correct Postgres parser rejects the file as a whole. This is not a PowerShell/quoting artifact and not primarily a statement-splitter bug; Supabase SQL editor / any naive splitter can surface the same failure earlier.

**Production disposition:** File `20260717120000_mkt_001b2_social_publish_jobs.sql` checksum `d11c1250…` matches git blob `6714de34…` and is recorded applied. Cron was repaired in-place with `$cron$…$cron$`. Schema/cron state is correct — **no forward repair migration required**. Preserve the applied migration; do not rewrite history.

**Future apply rules:**

1. Apply each migration file as **one atomic SQL unit** (`psql -v ON_ERROR_STOP=1 -f file.sql` or equivalent). Do not split on `;` inside dollar-quoted bodies.  
2. Never nest identical dollar tags; use distinct tags (e.g. `DO $migrate$ … $cmd$…$cmd$ … $migrate$;`).  
3. After apply, verify `cron.job` / expected objects even when `schema_migrations` records success (post-COMMIT sections can fail separately).  
4. Tooling/runbook fix preferred over meaningless forward migrations when production already matches intended state.
