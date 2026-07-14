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

**NO-GO — ENVIRONMENT SEPARATION NOT VERIFIED**

Supabase branch **database isolation is verified** (distinct project refs, API URLs, server addresses, anon key refs, and row-count profiles). Repository fail-closed guards and identity UI were implemented on `chore/environment-separation`.

Full PASS is blocked because:

1. Vercel environment variable scopes (Production vs Preview branch-scoped staging/development) **could not be read or configured** in this session (CLI token lacks team project access; Vercel MCP has no env-list tool).
2. Paystack live/test mode per Vercel target therefore **cannot be evidenced** without dashboard inspection (values not pulled; secrets not printed).
3. End-to-end Phase 10 deployment validation (staging write isolation proof via deployed URLs) was **not completed**.
4. Schema/migration history remains **divergent** across main / staging / development (expected for governed prod; staging ahead of prod; development baseline-only).
5. Staging and development Supabase branches are currently **ephemeral** (`persistent: false`).

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

# Final Decision

**NO-GO — ENVIRONMENT SEPARATION NOT VERIFIED**

Database isolation across Supabase branches is verified. End-to-end environment separation (Vercel variable mapping + payment mode evidence + deployed write isolation) is **not** verified.

---

# Next Authorized Action

1. **Dashboard (human):** configure branch-scoped Vercel Preview env vars for `staging` and `development`; purge conflicting unscoped Preview secrets; set Production `SHALEAN_APP_ENV=production` + live Paystack + main Supabase.
2. Merge PR from `chore/environment-separation` after review (guards + docs only).
3. Redeploy `staging` / `development`; capture `/api/health/environment` JSON (redacted) as evidence.
4. Authorize development schema catch-up + synthetic seed (non-prod only).
5. Re-run ENV-01 Phase 10 validation; only then flip decision to **PASS**.

---

## Appendix A — Target redacted matrix (copy for dashboard)

| Variable | Production/main | Staging | Development |
|----------|-----------------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | main ref `tchayecuvzssixyxlvfu` | staging ref `gfvdiczqyrvlmynvgegd` | development ref `hborcpvarvgynjsjnfei` |
| `SUPABASE_SERVICE_ROLE_KEY` | production key | staging key | development key |
| `PAYSTACK_SECRET_KEY` | live | test | test |
| `APP_URL` / site URL | `https://shalean.co.za` | staging Vercel URL | development Vercel URL |
| `SHALEAN_APP_ENV` | `production` | `staging` | `development` |
