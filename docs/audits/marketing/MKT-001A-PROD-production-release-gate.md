# MKT-001A-PROD — Production Release Gate & Verification

**Program:** Marketing Platform Remediation → production release
**Phase:** MKT-001A-PROD (production gate — the final phase before MKT-001A closes)
**Mode:** Planning + read-only production verification — **no production change performed in this document**
**Predecessors:** `MKT-001A-RC` / `RC2` / `RC3`, `OPS-001` §9 (staging verification PASS)
**Owner:** Release operator (Vercel + Supabase production access) + engineering reviewer
**Status:** ⛔ **NO-GO** — gate open; prerequisites not yet satisfied
**Created:** 2026-07-16

---

## 0. Executive decision

**NO-GO — unchanged.** MKT-001A is verified through `staging` (OPS-001 §9), but **production remains NO-GO** until every prerequisite in §3 and the GO checklist in §9 is satisfied. This document opens the production gate, records the current (read-only) production state, and defines the exact ordered steps, prerequisites, verification, rollback, and GO/NO-GO criteria.

No step in this document merged `staging → main`, deployed to production, applied a production migration, or changed any production environment variable. Those are **authorized GO actions** to be executed by an operator only after §9 is green.

---

## 1. Known-good identifiers (use these; do not guess)

| Item | Value |
|---|---|
| Code under release | `staging` @ `d6a1bcad` (PR #38 merge; contains MKT-001A + R1.1-001 booking fix) |
| Release target branch | `main` |
| Vercel project / team | `prj_eA7rHVSDiDXslAmrGwkdS4BtlVAc` / `team_gSaraaY4wPNKtO0Pfx5MY42D` |
| **Production** Supabase ref | `tchayecuvzssixyxlvfu` (`shalean-platform`) |
| **Staging** Supabase ref (already verified) | `gbgnemlpyykyhpqqbgru` (`shalean-platform-staging`) |
| Current production deployment | `main` @ `ad5b4ccb` (`dpl_446Tv4AZQ9bd1Gk37U5C72jwG7qm`, READY, `target=production`) |
| Rollback candidate | `ad5b4ccb` (current live production) |
| MKT-001A migrations to apply | `20260716180000_mkt_001a_promotions_financial_access`, `20260716180100_mkt_001a_publish_idempotency` |

---

## 2. Current production state (read-only, verified 2026-07-16T23:02Z)

| Check | Result | Method |
|---|---|---|
| Production identity | `deployment=production`, `vercelEnv=production`, `gitBranch=main`, `shaleanAppEnv=production` | `GET https://shalean.co.za/api/health/environment` |
| Production Supabase binding | `configuredRef=expectedRef=tchayecuvzssixyxlvfu`, `urlHost=tchayecuvzssixyxlvfu.supabase.co`, `issues:[]` | health endpoint |
| Paystack mode (prod) | `live` (`sk_live_…` / `pk_live_…`) | health endpoint |
| MKT-001A migrations on production | **0 present** — latest is `20261071_booking_fulfillment_mode_and_demand`; neither `mkt_001a_promotions_financial_access` nor `mkt_001a_publish_idempotency` exist | `list_migrations(tchayecuvzssixyxlvfu)` |
| Production code | `main @ ad5b4ccb` (pre-MKT-001A) | `list_deployments` |

**Interpretation.** Production is entirely un-impacted by MKT-001A today. The release delta is precisely: (a) merge `staging → main`, (b) apply the two forward-only migrations to `tchayecuvzssixyxlvfu`, (c) ensure the production marketing env is complete, (d) deploy, (e) verify.

---

## 3. Prerequisites (must ALL be satisfied before GO)

### 3.1 Operator smoke checklist — accepted as a documented operational prerequisite

The four admin-session-gated live flows (OPS-001 §9.4) could not be executed from the automation environment (no admin credentials / sandbox provider target). Per governance authorization, they are **explicitly accepted here as a documented operational prerequisite** — i.e. they do **not** block *authoring* this gate, but they **must be completed on `staging` (green) before the GO actions in §5 begin.** Carry-forward checklist (run on the staging deployment):

- [ ] **SSRF via publish** — admin publish request with unsafe `imageUrl` (localhost / private / metadata / redirect-to-private) rejected pre-fetch; valid HTTPS image succeeds.
- [ ] **OAuth decrypt + `v2` re-encrypt** — reconnect a GBP/Facebook account → token persisted in `v2:<keyId>` envelope; any existing token decrypts.
- [ ] **Live publish idempotency** — duplicate/concurrent publish of one promotion → exactly one external post; `marketing_publish_idempotency` shows one logical row.
- [ ] **Marketing dashboard / Connected Accounts UI** — admin pages render; connect/status surfaces correct.

If the operator elects to **formally defer** any item, record the deferral + rationale here before GO. Unresolved-and-undeferred ⇒ gate stays NO-GO.

> **Status update (2026-07-16T23:14Z):** the earlier blocker for this smoke (missing marketing encryption key on the staging preview) is **resolved** — staging now carries a branch-scoped `MARKETING_OAUTH_ENCRYPTION_KEY` (`Preview (staging)`) plus a verified Supabase binding, so all four checks are now **runnable on staging**. They remain **operator-gated**: each needs an authenticated admin session + a sandbox provider target, which the automation environment does not have. Per governance authorization (2026-07-16), the **operator will run these four checks on staging and record results here** before the §5 GO actions begin.

**Operator smoke results (2026-07-16):**

| Check | Result | Impact |
|---|---|---|
| SSRF via Publish | ✅ PASS | complete |
| **OAuth Re-encryption** | ❌ **FAIL** | **release blocker** |
| Publish Idempotency | ✅ PASS | complete |
| Connected Accounts UI | ✅ PASS | complete |

The OAuth re-encryption failure is investigated in **`docs/audits/marketing/MKT-001A-PROD-R1-oauth-reencryption-investigation.md`** (evidence: `evidence/mkt-001a-prod-r1-oauth-reencryption-2026-07-16T2332Z.json`). Root cause (high confidence): the **staging Google Business OAuth callback URL is not an Authorized redirect URI on the shared Google OAuth client**, so Google rejects the authorization request *before* the callback runs — the encryption key, legacy migration, Facebook, and the application code are **not** implicated. This is an OAuth-client/environment configuration gap, not a code defect. Remediation is config-only (register the staging redirect URI or provision a dedicated staging OAuth client), after which **only** the OAuth re-encryption check is re-run on staging. This does **not** reopen MKT-001A.

> **⚠️ Re-test (2026-07-17T00:11Z) — GO claim NOT substantiated; gate stays NO-GO.** A GO was declared claiming OAuth Re-encryption PASS + Production Key Scope PASS. Independent re-verification (evidence: `evidence/mkt-001a-prod-r1-oauth-retest-2026-07-17T0011Z.json`, and R1 §8) shows: (a) the redirect-URI fix worked and **token exchange now succeeds**, but the connection **save still fails** — `list_accounts_failed` 403 ("My Business Account Management API … not enabled" on Google Cloud project `525459256770`), then 429 rate-limit — so **no `v2:<keyId>` token is persisted** (staging `social_accounts` still empty) and re-encryption is **not verified**; and (b) production `MARKETING_OAUTH_ENCRYPTION_KEY` is **still scoped Preview + Production**, not Production-only. Both must be remediated and re-verified before GO. No `staging → main` merge, production migration, or deploy was performed.

### 3.2 Production environment variables (confirm BEFORE deploy)

Production runs on **live** keys — treat every change as customer-facing. Confirm on the Vercel **Production** scope (values never in git/logs/chat):

- [ ] `MARKETING_OAUTH_ENCRYPTION_KEY` — **present** on production (64-char hex). *Not observable via the health endpoint; must be confirmed directly.* Marketing OAuth token storage/decrypt **fails closed** without it (`TokenEncryptionConfigError`).
- [ ] `MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS` — only if a legacy production OAuth token must decrypt during rotation (else omit).
- [ ] Marketing provider credentials (Facebook Page / Google Business) — only if social publishing is enabled in production; live values.
- [ ] `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — already present for production (confirmed indirectly by healthy prod binding); no change.

#### 3.2.1 Verification record — read-only confirmation (2026-07-16T23:14Z)

Agent-executed **read-only** confirmation (Vercel CLI `env ls` returns names + scopes only, never values; Supabase MCP `list_migrations`/`list_projects`; production health endpoint). No env value was read, and no scope/deploy/migration was changed. Evidence: `docs/audits/marketing/evidence/mkt-001a-prod-env-confirmation-2026-07-16T2314Z.json`.

| Item | Result | Detail |
|---|---|---|
| Production identity (live) | ✅ | `/api/health/environment`: `deployment=production`, `gitBranch=main`, `shaleanAppEnv=production`, `configuredRef=expectedRef=tchayecuvzssixyxlvfu`, Paystack `live`, `issues:[]` |
| MKT-001A migrations on production | ✅ 0 present | `list_migrations(tchayecuvzssixyxlvfu)` latest `20261071_booking_fulfillment_mode_and_demand` |
| MKT-001A migrations on staging | ✅ both present | `20260716180000_mkt_001a_promotions_financial_access`, `20260716180100_mkt_001a_publish_idempotency` on `gbgnemlpyykyhpqqbgru` |
| `MARKETING_OAUTH_ENCRYPTION_KEY` exists on production | ✅ | one record scoped `Preview, Production` (created ~7m before capture) |
| `MARKETING_OAUTH_ENCRYPTION_KEY` **scoped only to Production** | ❌ **BLOCKER** | production-serving record is scoped **Preview + Production** → value bleeds into non-overridden PR-branch previews. Requires Production-only scope. |
| Key distinct from staging key | ✅ (by record) | staging has its own `Preview (staging)` record + development has `Preview (development)`, both created ~2h before capture; distinct from the production-serving record |
| Key value independence (no reuse of `GOOGLE_CLIENT_SECRET`/Supabase/staging value) | ⏳ operator attestation | not verifiable via CLI (values shown `Encrypted`) |
| Facebook/Google production creds present | ✅ | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID` on production |
| Facebook/Google creds **separate from staging** | ⚠️ | all scoped `Preview, Production` (shared values; no staging-branch override). "Valid" requires a provider-level check (operator/smoke). |

**Required operator remediation before GO (§9):**

1. Re-scope the production `MARKETING_OAUTH_ENCRYPTION_KEY` record to **Production-only** (remove the `Preview` target); staging/development retain their own branch-scoped keys. Agent will re-verify scope after remediation.
2. Attest that the production key value is newly generated and independent (not the staging key, not `GOOGLE_CLIENT_SECRET`, not a Supabase key or other application secret).
3. Decide whether production Facebook/Google credentials should be separated from the shared Preview+Production scope, and confirm they are valid.

Until item 1 is remediated and re-verified, §3.2 stays **unchecked** and the gate remains NO-GO.

### 3.3 Engineering sign-off

- [ ] `staging` verification PASS acknowledged (OPS-001 §9.3).
- [ ] No unrelated in-flight change will ride along in `staging → main` beyond what has been reviewed (confirm `git diff main...staging` scope).

---

## 4. Migration apply plan (production)

Both migrations are **forward-only and idempotent** (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `CREATE OR REPLACE VIEW`, `REVOKE`/`GRANT`). Apply to `tchayecuvzssixyxlvfu`:

1. `20260716180000_mkt_001a_promotions_financial_access.sql`
   - REVOKEs `anon`/`authenticated` table grants on `public.promotions`; drops `promotions_public_read_active`; creates `public.public_active_promotions` (safe projection, no financial columns; anon `SELECT`).
   - **Risk to confirm:** no production browser/anon client reads `public.promotions` directly. Migration author verified promotions are read server-side (service-role) only; **re-confirm against production traffic** (see §7).
2. `20260716180100_mkt_001a_publish_idempotency.sql`
   - Creates `public.marketing_publish_idempotency` (RLS, service-role-only, unique `(provider, idempotency_key)`). Required by the new publish routes.

**Ordering:** apply **both migrations together with (or immediately before) the production code deploy**, in a single maintenance step. The new code reads promotions server-side (consistent with the grant revocation) and the publish routes require the idempotency table to exist. Take a pre-apply snapshot of `pg_policies`/grants for `promotions` for rollback reference.

---

## 5. Deployment ordering (GO actions — operator, after §9 green)

```text
1. Confirm §3 prerequisites green (operator smoke, prod env vars, sign-off)
2. Snapshot production: current deployment id (ad5b4ccb), promotions grants/policies, migration list
3. Merge staging → main (via release PR; preserve history)
4. Apply the two MKT-001A migrations to tchayecuvzssixyxlvfu
5. Let Vercel build/deploy main to production (or promote the prebuilt deploy)
6. Run §7 production verification
7. Record GO/NO-GO outcome + evidence in §9
```

Keep migration apply and code deploy close together to avoid a window where new routes exist without the idempotency table, or old anon reads hit revoked grants.

---

## 6. Rollback readiness

| Failure | Rollback action |
|---|---|
| Bad production build / regression | Re-promote previous production deployment `ad5b4ccb` (`dpl_446Tv4AZQ9bd1Gk37U5C72jwG7qm`) — instant Vercel rollback |
| Promotions access regression (something *did* read `promotions` as anon) | Re-grant minimal read or restore `promotions_public_read_active` from the pre-apply snapshot; the safe view is additive and can stay |
| Idempotency table issue | Table is additive + service-role-only; drop only if it causes a defect (no data dependency yet) |
| Encryption key missing/mismatch | Marketing OAuth fails closed (no data corruption); set/repair `MARKETING_OAUTH_ENCRYPTION_KEY` and redeploy |

Migrations are forward-only; rollback is code re-promote + targeted grant/policy restore, not a down-migration.

---

## 7. Production verification (post-deploy)

| Gate | Method (prod) | Expected |
|---|---|---|
| Identity/binding | `GET /api/health/environment` | `production` / `tchayecuvzssixyxlvfu` / `issues:[]` |
| Migrations applied | `list_migrations(tchayecuvzssixyxlvfu)` | both `mkt_001a_*` present |
| Financial lockdown | SQL: `promotions` anon/authenticated grants `(none)`; `public_active_promotions` exists, no financial columns | as staging §9.3 |
| Public promotions read | Anon `GET /rest/v1/promotions?select=*` (should be denied) and the app's public campaign path still renders | no anon table read; app renders via service-role |
| Idempotency ledger | table + RLS + unique guard present | as staging §9.3 |
| Stored-XSS render | spot-check a real production campaign page renders sanitized (no seeding on prod) | safe markup only |
| Publish idempotency (live) | one controlled provider publish + duplicate → one external post | single post |
| Runtime logs | prod log scan for the new routes | no secret/token leakage; no config-absent errors |
| Regression smoke | booking flow (R1.1-001 fix rides along), homepage, key marketing pages | 200 / functional |

**Note:** avoid seeding test data on production. Prefer read-only checks + one controlled, reversible publish against a sandbox/owned provider target.

---

## 8. Monitoring (first 24–48h)

- Watch Vercel runtime errors for the marketing routes (`/api/admin/promotions/publish-*`, `/campaigns/*`, `/api/promotions`).
- Watch for `TokenEncryptionConfigError` (encryption key), `[supabase] client unavailable` (env), and any `promotions` permission-denied from client paths.
- Keep `ad5b4ccb` as the pinned rollback target until stable.

---

## 9. GO / NO-GO checklist (final gate)

- [ ] §3.1 operator smoke green on staging (or formally deferred + rationale recorded) — ⛔ **BLOCKED:** OAuth Re-encryption FAILED; see `MKT-001A-PROD-R1-oauth-reencryption-investigation.md` (staging Google OAuth redirect-URI not authorized). SSRF / Idempotency / Connected-UI passed.
- [ ] §3.2 production `MARKETING_OAUTH_ENCRYPTION_KEY` (+ provider creds if publishing) confirmed present
- [ ] §3.3 engineering sign-off + `staging → main` diff scope confirmed
- [ ] §4 pre-apply production snapshot captured
- [ ] §5 ordering understood; maintenance window/owner assigned
- [ ] §6 rollback target pinned (`ad5b4ccb`)
- [ ] §7 verification plan owner assigned
- [ ] Final decision recorded here: **GO** / **CONDITIONAL** / **NO-GO**

**Current decision: NO-GO** (prerequisites outstanding). The active blocker is the **§3.1 OAuth Re-encryption smoke FAILURE** (tracked in `MKT-001A-PROD-R1-oauth-reencryption-investigation.md`); the §3.2 production key scope remediation is also still open. On a clean GO execution + §7 PASS, **MKT-001A closes** and MKT-001B is unblocked.

---

## 10. Release sequence

```text
Operator smoke checklist (staging, §3.1)
        ↓
MKT-001A-PROD gate green (§9)
        ↓
Production env verification (§3.2)
        ↓
staging → main (§5.3)
        ↓
Apply MKT-001A migrations (§4) + production deployment (§5.5)
        ↓
Production verification (§7)
        ↓
MKT-001A closed
```
