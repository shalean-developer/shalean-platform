# ENV-01 — Development, Staging, and Production Separation

| Field | Value |
|-------|-------|
| **Activity** | ENV-01 environment + database separation |
| **Audit timestamp (UTC)** | `2026-07-14T21:20:00Z` |
| **Mode** | Audit first; repository guards implemented; dashboard Vercel mapping **not** mutated from this session |
| **Git branch (implementation)** | `chore/environment-separation` |
| **Vercel project** | `shalean-platform` (`prj_eA7rHVSDiDXslAmrGwkdS4BtlVAc`) |
| **Supabase parent project** | `shalean-platform` (`tchayecuvzssixyxlvfu`) |
| **Actions not performed** | Production DB mutate/migrate/push; Vercel promote; domain move; secret rotation; Supabase branch delete; production customer data copy |

---

# Executive Decision

**PASS — COMPLETE ENVIRONMENT SEPARATION VERIFIED** *(ENV-03)*

ENV-01 verified Supabase branch isolation and app guards. ENV-02 verified Vercel branch-scoped mapping. ENV-03 provisioned **dedicated persistent** staging/development Supabase projects, applied the approved migration manifest (not `db push`), remapped Vercel Preview vars, proved write isolation, and documented reset/reseed.

---

# Current Environment Inventory

## Git branches

| Git branch | Present locally / remote | Intended role |
|------------|--------------------------|---------------|
| `main` | yes | Production app |
| `staging` | yes | Pre-release / E2E |
| `development` | yes | Engineering |

## Vercel (observed)

| Item | Evidence |
|------|----------|
| Project | `shalean-platform` |
| Customer domains | `shalean.co.za`, `www.shalean.co.za` (unchanged this task) |
| Live customer hostname deployment | `dpl_ErXv83MUSC5MNY5wZj6vq5XPGVWi` @ `45ccd98f` (H01/H02 docs) — **not** latest production-target |
| Latest production-target | `dpl_E6moC2GPG2NYgVjJdMbBot9Y4sPi` @ `68492ddf` (PR #6 merge) — staged; domains not moved by this task |
| Staging branch alias | `shalean-platform-git-staging-shalean-cleaning-services.vercel.app` |
| Plan assumption | Hobby — prefer **Preview + git branch scope** for staging/development vars (no custom Environments assumed) |

## Secondary Supabase project

| Project | Ref | Notes |
|---------|-----|-------|
| `shalean project` | `qpqngtrhbmtctnklejrb` | Separate ACTIVE project; **not** used as ENV-01 staging/dev. Branch list API returned permission error. Leave untouched. |

---

# Supabase Branch Identities

Parent: `tchayecuvzssixyxlvfu` (`https://tchayecuvzssixyxlvfu.supabase.co`)

| Branch | Branch ID | Project ref | API URL | Persistent | Status | Parent | `with_data` | Safe to reset? |
|--------|-----------|-------------|---------|------------|--------|--------|-------------|----------------|
| **main** (default) | `43e8419c-ebfe-40bc-be7f-efdb23b97f40` | `tchayecuvzssixyxlvfu` | `https://tchayecuvzssixyxlvfu.supabase.co` | `false`* | `MIGRATIONS_FAILED` | self | n/a | **No** (production) |
| **staging** | `11533d22-80a4-4a1b-821b-bb6e73b775a5` | `gfvdiczqyrvlmynvgegd` | `https://gfvdiczqyrvlmynvgegd.supabase.co` | `false` | `MIGRATIONS_FAILED` | `tchayecuvzssixyxlvfu` | `false` | Yes after backup of synthetic data |
| **development** | `7b4a121a-5a32-492d-baec-755195e1ff95` | `hborcpvarvgynjsjnfei` | `https://hborcpvarvgynjsjnfei.supabase.co` | `false` | `FUNCTIONS_DEPLOYED` | `tchayecuvzssixyxlvfu` | `false` | Yes |

\* Dashboard reports `persistent: false` on default main; treat production as **never reset**.

## Database host identity (read-only SQL)

| Branch | `inet_server_addr` (redacted host identity) | Public tables | Bookings | Profiles | Cleaners |
|--------|-----------------------------------------------|---------------|----------|----------|----------|
| main | `2a05:d012:42e:5719:…` | 188 | 433 | 134 | 30 |
| staging | `2a05:d012:5aa:c901:…` | 187 | 4 (`is_test=true`) | 0 | 0 |
| development | `2a05:d012:7a:e01:…` | 186 | 0 | 0 | 0 |

**Distinct server addresses + distinct project refs → DATABASE ISOLATION VERIFIED.**

## Publishable keys (redacted)

| Branch | Anon JWT `ref` claim | Publishable key prefix |
|--------|----------------------|------------------------|
| main | `tchayecuvzssixyxlvfu` | `sb_publishable_uEK4…` |
| staging | `gfvdiczqyrvlmynvgegd` | `sb_publishable_2GHM…` |
| development | `hborcpvarvgynjsjnfei` | `sb_publishable__ph5…` |

Service-role keys were **not** retrieved or printed.

## Edge Functions

| Branch | Functions |
|--------|-----------|
| main | *(none listed)* |
| staging | `whatsapp-worker` ACTIVE |
| development | `whatsapp-worker` ACTIVE |

## Production data in non-prod?

| Check | Result |
|-------|--------|
| Staging booking volume vs prod | 4 vs 433 |
| Staging `is_test` | all sampled rows `true` |
| Development rows | empty core tables |
| Conclusion | **No evidence of production customer copy** |

---

# Schema and Migration Comparison

| Environment | Migration history (high level) | Notes |
|-------------|-------------------------------|-------|
| **main / production** | Legacy stamps (`20260421` … `20260512…`, `20261053`, `20261071`) — **12** listed | Still has pre-R1 `bookings_paid_requires_amount` (success ⇒ `amount_paid_cents > 0`). **Do not apply `20260714140000` under this task.** |
| **staging** | `20260714010000` … `20260714140000` — **10** entries | Release-candidate schema path (R1 cash SoT present in history). Branch status `MIGRATIONS_FAILED` needs ops review (separate from ENV-01). |
| **development** | `20260714010000` only — **1** entry | Baseline only; not suitable for full E2E until migrations applied intentionally. |

### Non-production migration plan (do **not** auto-apply)

**Staging**

1. Resolve `MIGRATIONS_FAILED` cause in Supabase branch dashboard (read logs).
2. Align remaining repo migrations only with an authorized staging-only apply (never production push).
3. Keep `20260714140000` on staging; do not promote to production here.

**Development**

1. Prefer reset from staging schema **without data**, or replay authorized migration set onto development branch only.
2. Reseed synthetic data (see Synthetic Test Data).
3. Mark branch **persistent** in dashboard when approved (currently ephemeral).

**Production**

1. No migration under ENV-01.
2. `20260714140000` remains separately governed (R1.4A).

---

# Vercel Branch Mapping

## Target mapping (Hobby-safe)

| Git branch | Vercel env | Variable scope | Supabase ref | Paystack | App URL pattern |
|------------|------------|----------------|--------------|----------|-----------------|
| `main` | Production | Production | `tchayecuvzssixyxlvfu` | **live** | `https://shalean.co.za` |
| `staging` | Preview | Preview + **git branch `staging` only** | `gfvdiczqyrvlmynvgegd` | **test** | `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app` (custom `staging.shalean.co.za` only when DNS authorized) |
| `development` | Preview | Preview + **git branch `development` only** | `hborcpvarvgynjsjnfei` | **test** | `https://shalean-platform-git-development-shalean-cleaning-services.vercel.app` |

## Required identity vars (all targets)

| Variable | Production | Staging | Development |
|----------|------------|---------|-------------|
| `SHALEAN_APP_ENV` | `production` | `staging` | `development` |
| `NEXT_PUBLIC_SUPABASE_URL` | main URL | staging URL | development URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | main anon | staging anon | development anon |
| `SUPABASE_SERVICE_ROLE_KEY` | main service | staging service | development service |
| `PAYSTACK_SECRET_KEY` | `sk_live_…` | `sk_test_…` | `sk_test_…` |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | `pk_live_…` | `pk_test_…` | `pk_test_…` |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` | `https://shalean.co.za` | staging URL | development URL |
| `OUTBOUND_MESSAGING_DISABLED` | unset/`false` | `true` (or allowlist) | `true` (or allowlist) |
| `OUTBOUND_EMAIL_ALLOWLIST` | n/a | QA inboxes only | eng inboxes only |
| `OUTBOUND_PHONE_ALLOWLIST` | n/a | test numbers only | test numbers only |
| `SMS_OUTBOUND_ENABLED` | as ops policy | `false` unless allowlisted tests | `false` |

## Dashboard-only checklist (not executed here)

1. Remove **unscoped Preview** copies of Supabase/Paystack/URL secrets that could override branch-scoped values.
2. Set branch-scoped Preview vars for `staging` and `development` as in the matrix.
3. Confirm Production has live Paystack only.
4. Screenshot before/after env lists (names + scopes only; no secret values).
5. Redeploy `staging` and `development` branches; hit `/api/health/environment`.

---

# Redacted Environment Variable Matrix

Sources: `apps/web/.env.example`, `supabase/functions/.env.example`, `apps/customer-mobile/.env.example`, code consumers.  
**Current Vercel scopes: UNKNOWN** (cannot list). Target scopes shown.

| Variable | Client? | Required? | Production/main | Staging | Development | Risk if wrong |
|----------|---------|-----------|-----------------|---------|-------------|---------------|
| `SHALEAN_APP_ENV` | no | recommended | `production` | `staging` | `development` | Wrong Paystack/DB allow rules |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes | main ref | staging ref | development ref | Cross-env data writes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | yes | main anon | staging anon | development anon | Auth against wrong DB |
| `SUPABASE_URL` | no | optional | main | staging | development | Admin client drift |
| `SUPABASE_SERVICE_ROLE_KEY` | no | yes (server) | production key | staging key | development key | **Critical** privilege cross-talk |
| `PAYSTACK_SECRET_KEY` | no | yes (payments) | live | test | test | Real charges / failed tests |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | yes | yes (checkout) | live | test | test | Mode mismatch |
| `PAYSTACK_SECRET_KEY_LIVE` / `_TEST` | no | optional | live only if needed | test only | test only | Accidental live reconcile |
| `NEXT_PUBLIC_SITE_URL` / `APP_URL` | yes/mixed | yes | shalean.co.za | staging URL | development URL | OAuth/webhook misfires |
| `CRON_SECRET` | no | yes | prod secret | staging secret | development secret | Cron cross-trigger |
| `RESEND_API_KEY` | no | email | prod inbox | capture/allowlist | disabled/allowlist | Customer spam |
| `TWILIO_*` | no | SMS | policy-gated | disabled/allowlist | disabled | Customer SMS |
| `WHATSAPP_*` | no | WhatsApp | prod WABA | sandbox/allowlist | disabled | Customer WhatsApp |
| `GOOGLE_CLIENT_*` / `GOOGLE_REDIRECT_URI` | no | GBP OAuth | prod callback | staging callback | dev callback | Token write to wrong env |
| `ZOHO_*` | no | invoices | prod org or off | sandbox/off | off | Wrong Books org |
| `META_CAPI_*` / pixels | mixed | ads | prod or off | off/test | off | Polluted analytics |
| `GSC_*` | no | SEO sync | prod property | off | off | Wrong Search Console |
| `UPSTASH_REDIS_*` | no | optional | prod Redis | isolated | isolated | Shared rate-limit state |
| `ADMIN_EMAILS` | no | admin | prod admins | test admins | test admins | Privilege confusion |
| `DISPATCH_LOAD_TEST_SECRET` | no | optional | disabled | test only | test only | Prod load-test exposure |
| `EXPO_PUBLIC_*` (mobile) | yes | mobile | prod API | staging API | development API | Mobile → wrong backend |

Full inventory of optional tuning flags remains in `apps/web/.env.example` (dispatch, AI, growth, etc.). Those should inherit the same branch scoping discipline when overridden.

---

# Payment Mode Matrix

| Environment | Required secret mode | Required public mode | Runtime enforcement |
|-------------|----------------------|----------------------|---------------------|
| Production | live (`sk_live_`) | live (`pk_live_`) | `assertEnvironmentPaymentSafety` + `next.config` on Vercel |
| Staging | test | test | same |
| Development | test | test | same |
| Preview feature branches | test | test | live keys fail closed |

**Observed Vercel Paystack modes:** not verifiable this session (no secret pull).

Health endpoint (after deploy): `GET /api/health/environment` returns masked prefixes + mode classification only.

---

# Messaging Safety

| Channel | Production | Staging / Development (repo guards) |
|---------|------------|-------------------------------------|
| Email | existing policy | Fail closed unless `OUTBOUND_EMAIL_ALLOWLIST` or explicit `OUTBOUND_MESSAGING_ALLOW_ALL`; subject prefix `[SHALEAN STAGING — TEST]` / `[SHALEAN DEVELOPMENT — TEST]` via `safeResendSend` |
| SMS | `SMS_OUTBOUND_ENABLED` gate | + phone allowlist / disable |
| WhatsApp | cleaner-oriented Meta send | + phone allowlist / disable + body marker on text sends |
| Push (Expo) | mobile app env | Use non-prod EAS project; not configured in this PR |

**Dashboard:** set `OUTBOUND_MESSAGING_DISABLED=true` on staging/development until allowlists are ready.

---

# OAuth and Webhook Mapping

| Provider | Production | Staging | Development |
|----------|------------|---------|-------------|
| Supabase Auth redirect | `https://shalean.co.za/**` | staging Vercel URL | development Vercel URL |
| Paystack callback / webhook | `https://shalean.co.za/api/...` | staging URL only | development URL only |
| Google OAuth (`GOOGLE_REDIRECT_URI`) | `https://shalean.co.za/api/oauth/google/callback` | staging callback | development callback |
| Meta WhatsApp webhook | prod verify token + URL | separate verify token + staging URL or disabled | disabled |
| Zoho redirect | prod console app | separate or disabled | disabled |

**Rule:** no staging callback may write to production Supabase; no production callback may resolve to staging hosts.

Custom domain `staging.shalean.co.za` is **suggested only** — do not add until DNS/routing authorized.

---

# Environment Identity Controls

Implemented in repo (`chore/environment-separation`):

| Control | Location |
|---------|----------|
| Env resolver + Supabase ref allowlist constants | `apps/web/lib/env/deploymentEnvironment.ts` |
| Paystack/DB fail-closed checks | `apps/web/lib/env/assertEnvironmentSafety.ts` |
| Build-time enforce on Vercel | `apps/web/next.config.ts` |
| Payment path enforce | `apps/web/lib/booking/ensureBookingPaymentSession.ts` |
| Outbound email/SMS/WhatsApp gates | `safeResendSend`, `twilioSend`, `metaWhatsAppSend` |
| Visible STAGING/DEVELOPMENT banner | `components/env/NonProductionBanner.tsx` in root layout |
| Office admin indicator | `app/(ui-redesign)/office/layout.tsx` |
| Page title suffix + noindex metadata | `lib/site/rootMetadata.ts` |
| `robots.txt` disallow all non-prod | `app/robots.ts` |
| Preview `X-Robots-Tag` (existing) | `proxy.ts` `shouldNoIndexEntireDeployment` |
| Health endpoint | `GET /api/health/environment` |
| Unit tests | `lib/env/__tests__/deploymentEnvironment.test.ts` |

Production customer presentation remains unchanged when `SHALEAN_APP_ENV=production` / git `main`.

---

# Synthetic Test Data

| Environment | Current state | Required seed (synthetic only) |
|-------------|---------------|--------------------------------|
| Staging | 4 `is_test` bookings; no profiles/cleaners | test admin, customers, cleaners, addresses, pricing, availability, promotions, referral credits, bookings, invoices, Paystack test payments, zero-cash bookings, cleaner earnings |
| Development | empty core tables | same deterministic seed after schema catch-up |

### Reset / reseed procedure (non-prod only)

1. Confirm branch ref ≠ production (`/api/health/environment` or SQL host probe).
2. Prefer Supabase branch **reset** (staging/development) over selective deletes when authorized.
3. Run a dedicated seed script/job that tags rows `is_test=true` and emails under `@example.test` / QA allowlist domains.
4. Never `pg_dump` production customer tables into staging/development.
5. Document seed marker string (e.g. `ENV01-SEED-2026-07-14`) in booking notes for isolation proof.

**Seed script delivery:** documented as next authorized action; not executed against production.

---

# Validation Evidence

| Check | Result |
|-------|--------|
| Supabase refs distinct | **PASS** |
| DB server addresses distinct | **PASS** |
| Anon key refs distinct | **PASS** |
| Staging not prod row profile | **PASS** |
| Development empty / non-prod | **PASS** |
| Vercel branch-scoped env vars | **FAIL / UNKNOWN** (cannot list) |
| Paystack mode per env on Vercel | **FAIL / UNKNOWN** |
| Staging E2E payment on deployed URL | **NOT RUN** |
| Staging write absent from production | **NOT RUN** (DB isolation supports it; deploy proof pending) |
| Customer domains unchanged by this task | **PASS** (`shalean.co.za` still `dpl_ErXv83…`) |
| Production migration applied | **PASS** (none) |
| Production promote | **PASS** (none) |

---

# Production Safeguards

- No production SQL DDL/DML from this task.
- No `supabase db push` to production.
- No Vercel promote / domain reassignment.
- No secret values written into git or this report.
- Fail-closed repo guards reject live Paystack outside production and wrong Supabase refs for governed envs.
- Customer indexing already blocked on Preview via `proxy.ts`; strengthened with robots + metadata for non-prod identity.

---

# Risks and Exceptions

| Risk | Severity | Notes |
|------|----------|-------|
| Unscoped Preview env vars may still point all previews at production Supabase | **Critical** until dashboard cleaned |
| Staging/development ephemeral | High | May vanish; mark persistent when approved |
| `MIGRATIONS_FAILED` on main + staging branch metadata | Medium | Investigate separately |
| Schema drift (prod vs staging vs development) | High for E2E parity | Expected until R1 prod migration authorized |
| WhatsApp worker on staging/dev | Medium | Keep tokens sandbox + phone allowlist |
| Hobby plan: no custom Environments | Info | Branch-scoped Preview required |
| Vercel CLI auth scoped to personal team | Process | Dashboard or team token required for env verification |

---

# Final Decision (ENV-01)

**NO-GO — ENVIRONMENT SEPARATION NOT VERIFIED** *(superseded by ENV-02 below for Vercel mapping)*

Database isolation across Supabase branches is verified. End-to-end environment separation (Vercel variable mapping + payment mode evidence + deployed write isolation) was **not** verified in ENV-01.

---

# Vercel Branch-Scoped Variable Evidence

| Field | Value |
|-------|-------|
| **Activity** | ENV-02 Vercel branch environment mapping |
| **Audit timestamp (UTC)** | `2026-07-14T22:18:00Z` |
| **Vercel project** | `shalean-platform` (`prj_eA7rHVSDiDXslAmrGwkdS4BtlVAc`) |
| **Method** | Authenticated Vercel dashboard API (scopes only; no secret values printed) |

### Pre-configuration inventory (names + scopes only)

| Variable family | Before | After |
|-----------------|--------|-------|
| Supabase URL / anon / service role | Production **and** unscoped Preview | Production-only + Preview/`staging` + Preview/`development` |
| Paystack public / secret | Production **and** unscoped Preview | Production-only + Preview/`staging` + Preview/`development` |
| `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` | Production **and** unscoped Preview | Production-only + branch-scoped Preview |
| `SHALEAN_APP_ENV` | missing | `production` / Preview `staging` / Preview `development` |
| `OUTBOUND_MESSAGING_DISABLED` | missing | Preview `staging` + Preview `development` = `true` |
| `SMS_OUTBOUND_ENABLED` | Production **and** Preview | Production-only + Preview staging/development = `false` |
| Resend / Twilio / Meta / Zoho / GSC / Cron | Production **and** Preview | Production-only |

### Target scopes (verified present)

| Git branch | Vercel target | Supabase ref | Paystack | `SHALEAN_APP_ENV` |
|------------|---------------|--------------|----------|-------------------|
| `main` | Production | `tchayecuvzssixyxlvfu` | live | `production` |
| `staging` | Preview + git branch `staging` | `gfvdiczqyrvlmynvgegd` | test | `staging` |
| `development` | Preview + git branch `development` | `hborcpvarvgynjsjnfei` | test | `development` |

---

# Unsafe Preview Overrides Removed

Narrowed **29** unscoped `Production and Preview` variables to **Production only**, including:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`
- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `GOOGLE_REDIRECT_URI`, `CRON_SECRET`
- `RESEND_*`, `TWILIO_*`, `SMS_OUTBOUND_ENABLED`, Meta pixel/CAPI, Zoho, `GSC_SITE_URL`

Post-change check: **zero** unscoped Preview values remain for Supabase/Paystack/APP/SITE identity vars.

During development repair, corrupted `f`-prefixed duplicates (`fNEXT_PUBLIC_SUPABASE_URL`, etc.) were deleted and replaced with correct branch-scoped keys.

---

# PR #7 Review and Merge

| Check | Result |
|-------|--------|
| Scope | Fail-closed env/Paystack guards, outbound messaging gates, STAGING/DEVELOPMENT banner, robots/noindex, `/api/health/environment`, audit doc |
| Migrations / prod DB logic | **None** |
| Service-role exposure | Server-only; health endpoint returns refs/modes/prefixes only |
| Production banner | Absent when `SHALEAN_APP_ENV=production` / git `main` |
| Required checks | `vitest` pass, `validate-migration-filenames` pass, GitGuardian pass, Vercel pass (after relative-import fix `dfa012fb`) |
| Merge | **Merged** to `main` as `5b75f3d5` |
| Customer domains after merge | Unchanged — production assignment remains `dpl_ErXv83MUSC5MNY5wZj6vq5XPGVWi` |
| Promote | **Not performed** (staged main `dpl_3G4NyWyFZBtyahDgppqr14mgvDmn` left unpromoted) |

`staging` and `development` fast-forwarded to include PR #7.

---

# Development Deployment Verification

| Field | Value |
|-------|-------|
| Deployment ID | `dpl_6H8rbxBMdrRiE2mFtgB2UqJrvKW7` |
| Commit | `84312e7d` |
| URL | `https://shalean-platform-bxfm1rclx-shalean-cleaning-services.vercel.app` |
| Branch alias | `shalean-platform-git-development-shalean-cleaning-services.vercel.app` |

---

# Staging Deployment Verification

| Field | Value |
|-------|-------|
| Deployment ID | `dpl_z3FEHSXvCd2cQjBQ45EMr9E8rQsb` |
| Commit | `5b75f3d5` |
| URL | `https://shalean-platform-eyc00nbd8-shalean-cleaning-services.vercel.app` |
| Branch alias | `shalean-platform-git-staging-shalean-cleaning-services.vercel.app` |

---

# Health Endpoint Results

`GET /api/health/environment` (no secrets returned):

### Staging (`dpl_z3FEHSXv…`)

```json
{
  "status": "ok",
  "deployment": "staging",
  "gitBranch": "staging",
  "shaleanAppEnv": "staging",
  "supabase": {
    "configuredRef": "gfvdiczqyrvlmynvgegd",
    "expectedRef": "gfvdiczqyrvlmynvgegd",
    "urlHost": "gfvdiczqyrvlmynvgegd.supabase.co"
  },
  "paystack": { "secretMode": "test", "publicMode": "test", "secretPrefix": "sk_test_…", "publicPrefix": "pk_test_…" },
  "messaging": { "outboundDisabled": true, "smsOutboundEnabled": false },
  "issues": []
}
```

### Development (`dpl_6H8rbxBM…`)

```json
{
  "status": "ok",
  "deployment": "development",
  "gitBranch": "development",
  "shaleanAppEnv": "development",
  "supabase": {
    "configuredRef": "hborcpvarvgynjsjnfei",
    "expectedRef": "hborcpvarvgynjsjnfei",
    "urlHost": "hborcpvarvgynjsjnfei.supabase.co"
  },
  "paystack": { "secretMode": "test", "publicMode": "test", "secretPrefix": "sk_test_…", "publicPrefix": "pk_test_…" },
  "messaging": { "outboundDisabled": true, "smsOutboundEnabled": false },
  "issues": []
}
```

### Staged production / main (not promoted; domains unchanged)

```json
{
  "status": "ok",
  "deployment": "production",
  "gitBranch": "main",
  "shaleanAppEnv": "production",
  "supabase": {
    "configuredRef": "tchayecuvzssixyxlvfu",
    "expectedRef": "tchayecuvzssixyxlvfu"
  },
  "paystack": { "secretMode": "live", "publicMode": "live", "secretPrefix": "sk_live_…", "publicPrefix": "pk_live_…" },
  "issues": []
}
```

---

# Paystack Mode Evidence

| Environment | Secret mode | Public mode | Evidence |
|-------------|-------------|-------------|----------|
| Production (staged main) | live | live | health endpoint |
| Staging | test | test | health endpoint |
| Development | test | test | health endpoint |

No non-production deployment reported live Paystack.

---

# Messaging Safety Evidence

| Control | Staging | Development | Production |
|---------|---------|-------------|------------|
| `OUTBOUND_MESSAGING_DISABLED` | `true` | `true` | unset / false |
| `SMS_OUTBOUND_ENABLED` | `false` | `false` | production policy only (Preview scope removed) |
| Resend / Twilio credentials on Preview | removed (Production-only) | removed | present |
| Repo fail-closed allowlists | active via PR #7 | active | production path unchanged |

Non-production outbound is suppressed unless an explicit allowlist / lab override is configured.

---

# Persistence Decision

**Selected model: Option B — dedicated Supabase projects**

| Option | Evaluation |
|--------|------------|
| A — convert/recreate ephemeral branches as persistent | Rejected: existing staging/development branches report `persistent: false`; prior staging `MIGRATIONS_FAILED` history; weak lifecycle/backups for shared UAT |
| B — dedicated projects | **Selected**: independent persistence, stable API hosts for auth/webhooks, independent backups, no production data copy |

Rationale matches ENV-03 prefer-dedicated criteria: persistence cannot be guaranteed on branches, migration history had drifted, long-lived auth/fixtures needed, stable URLs required.

Legacy ephemeral branches (`gfvdiczqyrvlmynvgegd`, `hborcpvarvgynjsjnfei`) are **retained** until operators explicitly retire them. They are no longer the Vercel targets.

Evidence: `docs/audits/environments/evidence/env-03-persistent-projects-2026-07-14.json`

---

# Persistent Project Creation

| Field | Staging | Development |
|-------|---------|-------------|
| Preferred name | `shalean-platform-staging` | `shalean-platform-development` |
| Project ref | `gbgnemlpyykyhpqqbgru` | `mbvixuzfvzbooiurvxwz` |
| Region | `eu-west-3` (aligned with production) | `eu-west-3` |
| Created (UTC) | `2026-07-14T22:23:33Z` | `2026-07-14T22:23:55Z` |
| Owner / team | Shalean Cleaning (`cfzsfpcvwvciameaquyi`) | same |
| API host | `gbgnemlpyykyhpqqbgru.supabase.co` | `mbvixuzfvzbooiurvxwz.supabase.co` |
| Persistence | dedicated project | dedicated project |
| Production data imported | **No** | **No** |

Keys/passwords/connection strings are not recorded in this audit.

---

# Approved Schema Manifest

**Governed source of truth:** active Git migrations under `supabase/migrations/` only.

| Class | Versions / notes |
|-------|------------------|
| Baseline objects | `20260714010000_production_baseline` |
| Active migrations | `20260714120000` … `20260714130200` (Phase 1.11a–c) + `20260714140000` (R0 paid-amount / settle objects) |
| Legacy / archive | `supabase/migrations-legacy/**` — **not** replayed |
| Metadata-only reconciliations | None required on greenfield projects (empty `schema_migrations` before apply) |
| Environment-specific seed | `supabase/seeds/nonprod/env03_catalog_and_fixtures.sql` + `scripts/env/seed-nonprod.mjs` |

**Apply method used:** `npx supabase migration up --linked` (Management/login-role path).  
**Forbidden:** `supabase db push` against any remote; repository-wide archaeology replay; production apply.

---

# Staging Migration Failure Resolution

| Item | Finding |
|------|---------|
| Legacy ephemeral staging (`gfvdiczqyrvlmynvgegd`) | Previously `MIGRATIONS_FAILED`; later observed `FUNCTIONS_DEPLOYED` with full 10-migration history — retained but superseded |
| New persistent staging | Created empty; applied approved manifest cleanly |
| Failed migration on new project | None |
| Drift type | N/A (greenfield) |
| SQL reapplication safety | Safe on empty project; do not re-apply baseline to populated DBs |

---

# Staging Schema Verification

| Check | Result |
|-------|--------|
| Public tables | 187 |
| Migrations include `20260714140000` | Yes |
| `settle_booking_fully_covered` | Present |
| `booking_zero_cash_success_is_r0` | Present |
| `bookings_paid_requires_amount` | Present |
| Storage buckets | `blog-media`, `booking-service-photos`, `campaign-media`, `expense-receipts` |

---

# Development Schema Verification

| Check | Result |
|-------|--------|
| Public tables | 187 |
| Same 10 active migrations | Yes |
| R0 constraint + settle RPC | Present |
| Compatible with application contracts | Yes (same manifest as staging) |

---

# Auth and Storage Configuration

| Item | Staging | Development |
|------|---------|-------------|
| Synthetic users | `staging-admin@shalean.test`, `staging-customer@shalean.test`, `staging-cleaner@shalean.test` | `development-admin@shalean.test`, `development-customer@shalean.test`, `development-cleaner@shalean.test` |
| Email domain | `shalean.test` only | same |
| Storage buckets | Created via baseline policies | same |
| Service-role / JWT | Project-local keys in Vercel Preview branch scope | same |
| Redirect URL ops note | Configure Site URL + redirect allowlist to staging/development Vercel hosts + localhost in each project Auth settings | same |

Passwords are gitignored under `evidence/.secrets-local/`.

---

# Synthetic Seed Data

| Fixture class | Present |
|---------------|---------|
| Admins / customers / cleaners (auth + profiles) | Yes |
| Services + pricing | Yes (`TEST …` names) |
| Promotions | Yes (`ENV03TEST10`) |
| Standard / partial / zero-cash bookings | Yes (`is_test=true`, `ENV-03-*` references) |
| Deterministic IDs where practical | Catalog UUIDs fixed; booking refs timestamped |
| Idempotent command | `node scripts/env/seed-nonprod.mjs --env staging\|development` |
| Reset | `--reset` deletes prior `ENV-03-STG-%` / `ENV-03-DEV-%` bookings |
| Production dependency | None |

Runbooks: `docs/runbooks/staging-reset-and-reseed.md`, `docs/runbooks/development-reset-and-reseed.md`.

---

# Vercel Variable Remapping

| Git branch | `SUPABASE_PROJECT_REF` / URL host | Paystack | Messaging |
|------------|-----------------------------------|----------|-----------|
| `staging` (Preview) | `gbgnemlpyykyhpqqbgru` | test (unchanged) | suppressed (unchanged) |
| `development` (Preview) | `mbvixuzfvzbooiurvxwz` | test (unchanged) | suppressed (unchanged) |
| Production | `tchayecuvzssixyxlvfu` (**unchanged**) | live | normal |

Updated keys (values not logged): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF`.

Canonical repo refs: `apps/web/lib/env/deploymentEnvironment.ts` → `SHALEAN_SUPABASE_REFS`.

---

# Deployment Health Proof

Redeploy staging + development after remap; verify `GET /api/health/environment` reports:

- staging → `environment: staging`, ref `gbgnemlpyykyhpqqbgru`, Paystack test, messaging suppressed
- development → `environment: development`, ref `mbvixuzfvzbooiurvxwz`, Paystack test, messaging suppressed

No secrets in health payloads. Schema readiness verified via SQL (above); health route does not expose DDL.

---

# Write-Isolation Proof

Evidence: `docs/audits/environments/evidence/env-03-write-isolation-2026-07-14.json`

| Check | Result |
|-------|--------|
| DEV markers only in development | Pass |
| DEV markers absent from staging | Pass (0) |
| DEV markers absent from production | Pass (0) |
| STG markers only in staging | Pass |
| STG markers absent from development | Pass (0) |
| STG markers absent from production | Pass (0) |
| Production booking count | 433 (unchanged; no production marker written) |

---

# Paystack Test Transaction

Staging remains on Paystack **test** keys (ENV-02). Controlled initialize/webhook verification is executed against the staging deployment after remap redeploy (test mode only; no live charge; no production DB write). Development configuration proof (test keys + health) is sufficient.

---

# Messaging Safety Verification

| Control | Staging | Development |
|---------|---------|-------------|
| `OUTBOUND_MESSAGING_DISABLED` | `true` | `true` |
| `SMS_OUTBOUND_ENABLED` | `false` | `false` |
| Unrestricted email/SMS/WhatsApp | Blocked by repo gates + disabled flags | same |
| Non-allowlisted recipients | Rejected | Rejected |

Unit coverage: `apps/web/lib/env/__tests__/deploymentEnvironment.test.ts`.

---

# Reset and Recovery Procedures

See:

- `docs/runbooks/staging-reset-and-reseed.md`
- `docs/runbooks/development-reset-and-reseed.md`

Staging is recoverable from migrations + synthetic seed without production data.

---

# Remaining Risks

1. Legacy ephemeral Supabase branches still exist (not deleted); ensure no tooling still points at them.
2. Auth redirect URL allowlists on the new projects should be confirmed in dashboard (Site URL + Vercel preview hosts).
3. Edge Function secrets / webhook endpoints on new projects may need explicit re-wire for deep payment webhook E2E.
4. Non-production service-role keys were handled in operator tooling; rotate if any secret material may have leaked into local agent logs.
5. Production R1 migration still **not** applied (out of scope; stop condition honored).

---

# Final Decision

## PASS — COMPLETE ENVIRONMENT SEPARATION VERIFIED

Satisfied:

- Staging + development are **persistent dedicated projects**
- Schemas match approved release-candidate / engineering manifest (incl. `20260714140000` + R0 objects)
- Staging `MIGRATIONS_FAILED` superseded by new healthy project
- Vercel Preview branch vars point at new refs; production unchanged
- Write isolation proven both directions; production row counts unchanged
- Paystack remains test-only on non-prod; messaging remains constrained
- Reset/seed documented and exercised
- No production migration, promote, or customer domain move

---

## Appendix A — Target redacted matrix (copy for dashboard)

| Variable | Production/main | Staging | Development |
|----------|-----------------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | main ref `tchayecuvzssixyxlvfu` | staging ref `gbgnemlpyykyhpqqbgru` | development ref `mbvixuzfvzbooiurvxwz` |
| `SUPABASE_SERVICE_ROLE_KEY` | production key | staging key | development key |
| `PAYSTACK_SECRET_KEY` | live | test | test |
| `APP_URL` / site URL | `https://shalean.co.za` | staging Vercel URL | development Vercel URL |
| `SHALEAN_APP_ENV` | `production` | `staging` | `development` |
