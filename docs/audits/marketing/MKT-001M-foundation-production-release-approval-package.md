# MKT-001M — Foundation Production Release Approval Package

**Date:** 2026-07-20  
**PR:** [#71](https://github.com/shalean-developer/shalean-platform/pull/71)  
**Scope:** Provider-disabled foundation release only  
**Constraint for this preparation task:** Do **not** execute backup, migrations, merge, or deployment.

---

## Final outcome

### **READY FOR FOUNDATION RELEASE APPROVAL**

Request the exact phrase:

`approve foundation production release`

That phrase authorizes only the provider-disabled foundation release. It does **not** authorize Meta Live, provider connection, provider enablement, or publishing.

---

## 1. Exact release SHA

| Field | Value |
|---|---|
| Exact proposed head | `c052c315b8cfcb61fb1e397a3e4d0888728ef4e6` |
| Branch | `staging` |
| Base | `main` (`ad5b4ccb242f2e1a3c4a98edf421820324a8e18e`) |
| Tip message | `docs(marketing): record MKT-001L remediation head SHA` |
| Local `origin/staging` | **SHA_MATCH** |
| Working-tree delta vs approved release | **None in tracked files.** Untracked only: `docs/audits/marketing/MKT-001X-x-staging-configuration-verification.md` (not part of release; do not include) |
| Ahead of `main` | 85 commits |

**Stop condition:** If `origin/staging` moves off this SHA, or mandatory checks turn red, this package is void until re-verified.

---

## 2. PR status and complete CI matrix

| Field | Value |
|---|---|
| PR | #71 — `release(marketing): Facebook and Instagram production promotion` |
| State | OPEN, **draft**, mergeable=`MERGEABLE` |
| URL | https://github.com/shalean-developer/shalean-platform/pull/71 |

### Checks on exact SHA `c052c315…`

| Check | Result | Evidence |
|---|---|---|
| vitest (web-test) | **PASS** | [run 29759241116](https://github.com/shalean-developer/shalean-platform/actions/runs/29759241116) — includes PR-build crawl + compliance route matrix |
| validate-migration-filenames | **PASS** | [run 29759241269](https://github.com/shalean-developer/shalean-platform/actions/runs/29759241269) |
| GitGuardian Security Checks | **PASS** | Dashboard check on head |
| Vercel (Preview) | **PASS** | Deployment `Fp27WhBhxUfKNK2wU1Eku8VnvYze` |
| Vercel Preview Comments | **PASS** | On head |
| Supabase Preview | **SKIPPED** | Expected for this PR |

### Vercel Preview identity

| Field | Value |
|---|---|
| GitHub Preview deployment id | `5525132701` |
| SHA | `c052c315b8cfcb61fb1e397a3e4d0888728ef4e6` |
| Created | `2026-07-20T16:25:55Z` |
| Vercel URL | https://vercel.com/shalean-cleaning-services/shalean-platform/Fp27WhBhxUfKNK2wU1Eku8VnvYze |

**Operator pre-merge:** mark PR ready (undraft) before merge; do not change head.

---

## 3. Legal conditions

**Legal gate:** `CONDITIONAL PASS — foundation release with all providers disabled`  
(Source: MKT-001L — `docs/audits/marketing/MKT-001L-legal-privacy-meta-compliance-review.md`)

Carry-forward (block Meta Live / provider activation; **do not** block this foundation release):

1. Legal-entity particulars require confirmation  
2. Lawful bases require confirmation  
3. Cross-border operator inventory remains incomplete  
4. Retention schedule remains undefined  
5. Durable deletion ledger/queue remains outstanding  
6. Completion requires operational evidence  
7. Information Officer status requires confirmation  
8. Meta App Review wording requires review before Live  

---

## 4. Production flag matrix (mandatory)

**Code fail-closed proof:** `apps/web/lib/promotions/providers/registry.ts` — unset → disabled for all keys (`facebook`, `instagram`, `x`, `google_business`, `linkedin`, `pinterest`). Tests assert unset = disabled.

**Preferred production record (explicit `0`):**

| Variable | Required value | Notes |
|---|---|---|
| `MARKETING_PROVIDER_FACEBOOK` | `0` | Preferred over unset for release evidence |
| `MARKETING_PROVIDER_INSTAGRAM` | `0` | |
| `MARKETING_PROVIDER_X` | `0` | |
| `MARKETING_PROVIDER_GOOGLE_BUSINESS` | `0` | |
| `MARKETING_PROVIDER_LINKEDIN` | `0` | |
| `MARKETING_PROVIDER_PINTEREST` | `0` | |

**Do not** add production OAuth credentials merely to complete foundation deploy.  
**Do not** connect providers.  
**Do not** set any `MARKETING_PROVIDER_*=1`.

**Pre-deploy verification (operator):** Vercel Production env UI / CLI — confirm all six are `0` (or unset). Record screenshot/redacted export in release evidence. Re-check after deploy.

---

## 5. Backup commands and verification method

**Production DB identity (confirm before any DB action):**

| Field | Required value |
|---|---|
| Project name | `shalean-platform` |
| Ref | `tchayecuvzssixyxlvfu` |
| Environment | Production |
| Staging refs (must **not** select) | e.g. `gbgnemlpyykyhpqqbgru` and other non-prod |
| Host (non-secret) | `db.tchayecuvzssixyxlvfu.supabase.co` |

**PITR:** Disabled (`pitr_enabled: false`). Restore is **coarse** (physical + logical only). See H02B backup-only exception model.

### 5.1 Record latest completed Supabase physical backup (do not invent)

```bash
# Confirm project ref interactively before running
npx supabase backups list --project-ref tchayecuvzssixyxlvfu --output json > release-evidence/mkt-001m/physical-backups.json
```

Record: latest `COMPLETED` backup id, timestamp (UTC), `walg_enabled`, `pitr_enabled: false`.

### 5.2 Fresh encrypted logical backup (roles / schema / data) — prepare only

Use a secure workstation, approved DB URL from secrets manager (never commit). Example pattern:

```bash
export RELEASE_TS="$(date -u +%Y%m%dT%H%M%SZ)"
export EVIDENCE_DIR="/secure/release-evidence/mkt-001m/${RELEASE_TS}"
mkdir -p "$EVIDENCE_DIR"
# DATABASE_URL must point at tchayecuvzssixyxlvfu only — verify host contains the ref

pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl \
  --roles-only -f "$EVIDENCE_DIR/01-roles.dump"
pg_dump "$DATABASE_URL" --format=custom --schema-only --no-owner --no-acl \
  -f "$EVIDENCE_DIR/02-schema.dump"
pg_dump "$DATABASE_URL" --format=custom --data-only --no-owner --no-acl \
  -f "$EVIDENCE_DIR/03-data.dump"

# Encrypt at rest (example — use org-approved tool/key)
gpg --symmetric --cipher-algo AES256 \
  -o "$EVIDENCE_DIR/01-roles.dump.gpg" "$EVIDENCE_DIR/01-roles.dump"
gpg --symmetric --cipher-algo AES256 \
  -o "$EVIDENCE_DIR/02-schema.dump.gpg" "$EVIDENCE_DIR/02-schema.dump"
gpg --symmetric --cipher-algo AES256 \
  -o "$EVIDENCE_DIR/03-data.dump.gpg" "$EVIDENCE_DIR/03-data.dump"
shred -u "$EVIDENCE_DIR"/0{1,2,3}-*.dump   # keep only ciphertext if policy requires

sha256sum "$EVIDENCE_DIR"/*.gpg > "$EVIDENCE_DIR/SHA256SUMS"
```

### 5.3 Verification (no restore over production)

| Step | Action | Pass criteria |
|---|---|---|
| Exit status | Each `pg_dump` / encrypt command | Exit 0 |
| Sizes | `ls -la` | Non-zero; roles < schema < data typically |
| Checksums | `sha256sum -c SHA256SUMS` | OK |
| Readable | `pg_restore -l` on each dump (or decrypt→list) | TOC lists without error |
| No PII in evidence notes | Counts only | No customer rows in logs/tickets |
| Baseline counts (no PII) | `SELECT count(*)` on `bookings`, `promotions`, `social_accounts`, etc. | Recorded before migrate |

**Stop if any backup component fails.** Do not proceed to migrations.

---

## 6. Five-migration execution matrix

Apply **only** these five, **in order**, after backup success. All are **ABSENT on `main`** today (verified).

| # | File | SHA256 (workspace @ release tree) | Git blob @ `c052c315` | Size (B) | Pre-check | Post markers | Stop on fail |
|---|---|---|---|---|---|---|---|
| 1 | `20260716180000_mkt_001a_promotions_financial_access.sql` | `131bba55d2435487a158810c053276e52dfb6b2b1a80a8e3d5981d05bf614a3a` | `8c13f3c66b388ec25ca4c96b9343989ff86e5cbd` | 3372 | Absent in `supabase_migrations.schema_migrations` | View `public.public_active_promotions`; `promotions` revoked from anon/authenticated; policy `promotions_public_read_active` dropped | Yes |
| 2 | `20260716180100_mkt_001a_publish_idempotency.sql` | `98ee8eec68fed773a3806482a19fc92c2d9295865ff06623daba5ac17e1841ac` | `79cda186c7c1c5e259a367ec03d2bd1447a54f6c` | 2880 | Absent | Table `marketing_publish_idempotency` + unique `(provider, idempotency_key)` | Yes |
| 3 | `20260717120000_mkt_001b2_social_publish_jobs.sql` | `d11c12506ae312cc6e8b80f7f2eee5c38e5f8656e58783a100df2883892bbb4a` | `6714de3482f395cda524b65efcbf46d361515bb1` | 8638 | Absent | Table `social_publish_jobs` + lease/status checks | Yes |
| 4 | `20260717180000_mkt_001g_instagram_ledger_provider.sql` | `ce8790d0ef2f1c1c2fde87e46707223d6d87fa6c1d3bc8e2323ea3ab5f301947` | `4388735959bbabaf89fe3ce8e7a0eb22ad22b586` | 802 | Absent | Provider CHECK includes `instagram` on ledger + jobs | Yes |
| 5 | `20260718120000_mkt_001i_x_ledger_provider.sql` | `6ee27e2a46d18b16dbef7a5aa4b435f14568457da7f6aecc3ba542badf1fb5e7` | `5b0803f4c69a4bedce4dc13ecaed03ee3f19ad91` | 776 | Absent | Provider CHECK includes `x` | Yes |

**Before each:** re-confirm project ref `tchayecuvzssixyxlvfu`; confirm file checksum matches table; confirm version still absent.

**After each:** migration-history row present; markers above; no unexpected `GRANT` expansion to `anon`/`authenticated`; record duration + exit status.

**Apply method (authorized execution only):** controlled `supabase db` / SQL editor against production with Model B / org change-control — not blind `db push --include-all`.

---

## 7. Deployment sequence (approved order)

1. Establish release freeze (no concurrent prod DB/admin schema changes).  
2. Confirm exact PR head `c052c315…` and green checks.  
3. Confirm all provider flags `0` on Vercel Production.  
4. Complete and verify logical backup (roles/schema/data).  
5. Record physical-backup evidence.  
6. Apply and verify five migrations (stop on first failure).  
7. Undraft PR #71; merge to `main` via controlled process (merge commit or approved squash — preserve release tree equivalence to `c052c315` content).  
8. Confirm `main` contains the approved release tree.  
9. Allow Vercel production deployment.  
10. Confirm production deployment SHA + deployment ID.  
11. Confirm production Supabase ref still `tchayecuvzssixyxlvfu` (`/api/health/environment`).  
12. Verify public + admin health (matrix §8).  
13. Keep every provider disabled.  
14. Run `production-live-internal-links` workflow against `https://shalean.co.za`.  
15. Close release or roll back based on evidence.

---

## 8. Production smoke-test matrix

| # | Check | Pass criteria | Notes |
|---|---|---|---|
| S1 | `GET /` | 200 | |
| S2 | Booking entry routes | 200 / healthy | Do not create live paid bookings unless approved |
| S3 | Admin authentication | Login OK | No publish |
| S4 | `GET /privacy` | 308/301 → `/privacy-policy` | |
| S5 | `GET /privacy-policy` | 200 | |
| S6 | `GET /data-deletion` | 200 | |
| S7 | `GET /data-deletion/status` | 200; no PII; invalid code = unknown | |
| S8 | `POST /api/meta/data-deletion` invalid signature | 400 | **Do not** send valid Meta signed_request unless separately approved |
| S9 | `GET /terms-of-service` | 200 | |
| S10 | Ten legacy location short-slugs | 308 → `/locations` 200 | Same set as MKT-001K |
| S11 | `production-live-internal-links` | PASS | Workflow on `main` push / dispatch |
| S12 | DB health + baseline counts | Plausible vs pre-migrate | No PII in evidence |
| S13 | No OAuth/publish jobs | Queue empty / no new succeeded posts | Flags off |
| S14 | Provider flags | All still `0` | Re-read Vercel Production |

---

## 9. Rollback triggers and actions

### Triggers (any → stop / roll back)

- Backup incomplete or unreadable  
- Any migration failure  
- Production deploy SHA ≠ approved tree  
- Wrong Supabase ref  
- Provider flag accidentally `1`  
- Public/booking/admin health failure  
- Live-link workflow RED after deploy (investigate; location redirects should turn GREEN on this tree)

### Actions (separated)

| Layer | Action |
|---|---|
| 1. Provider kill switches | Already off; force all `MARKETING_PROVIDER_*=0` if drifted |
| 2. Application rollback | Redeploy prior production SHA `ad5b4ccb242f2e1a3c4a98edf421820324a8e18e` (current `main` tip) |
| 3. Database | Prefer leave forward migrations if app-compatible; else compensating SQL or **authorized** physical/logical restore (coarse; PITR unavailable) |
| 4. Public routes | Restored with app rollback |
| 5. Credentials/tokens | N/A — providers remain disconnected |

**Schema compatibility note:** Migrations are additive (new tables/view + grant lockdown + CHECK widen). Prior production app on `ad5b4ccb…` does not require the new queue tables; financial `REVOKE` is compatible with service-role-only promotion reads. App rollback after successful migrations is the preferred first recovery; DB restore is last resort.

---

## 10. Named operator / verification responsibilities

| Role | Responsibility |
|---|---|
| **Release Owner** | Freeze, SHA/CI gate, merge authorization, go/no-go close |
| **DB Operator** | Project-ref proof, physical backup record, logical backup, migrations, marker verification |
| **App Deploy Verifier** | Vercel Production flags, deploy SHA/ID, `/api/health/environment`, smoke matrix S1–S14 |
| **Compliance witness** | Confirm Legal CONDITIONAL PASS conditions remain acknowledged; no Meta Live |
| **On-call / recovery authority** | Authorize restore if required (backup-only model) |

Fill names on execution day in release evidence.

---

## 11. Expected customer impact and downtime

| Item | Expectation |
|---|---|
| Customer booking/payment path | No intentional change; brief risk window during migrate/deploy |
| Planned downtime | Prefer **zero** hard downtime; schedule low-traffic window for migrations |
| Marketing social publish | **Inactive** (flags off) — no customer-facing social change |
| Public compliance pages | New/updated privacy + data-deletion become live — positive |
| Location short-slug links | Should **fix** production 404s → 308 |

---

## 12. Authorization boundary

| Authorized by `approve foundation production release` | Not authorized |
|---|---|
| Backup + five migrations + merge #71 + prod deploy with flags `0` | Meta Live / App Review submission as Live |
| Smoke tests without valid Meta deletion callback | Setting any `MARKETING_PROVIDER_*=1` |
| Production live-link workflow | Connecting Facebook/Instagram/X/GBP |
| | Adding prod OAuth secrets solely for this foundation |

---

## Pre-flight identity checklist (execution day)

- [ ] `git rev-parse origin/staging` == `c052c315b8cfcb61fb1e397a3e4d0888728ef4e6`  
- [ ] `gh pr checks 71` all mandatory green  
- [ ] Vercel Preview SHA matches  
- [ ] Supabase dashboard project = `shalean-platform` / `tchayecuvzssixyxlvfu`  
- [ ] All six provider flags `0` on Production  
- [ ] Logical backup verified  
- [ ] PITR recorded as disabled  
- [ ] Approval phrase received  

**Package prepared without executing backup, migrations, merge, or deployment.**
