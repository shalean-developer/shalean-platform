# MKT-001K — Production Blocker Remediation (Staging / Code Only)

**Date:** 2026-07-20  
**Branch:** `staging`  
**Constraint:** No production Supabase, Vercel, Meta, or traffic changes in this task.  
**Production decision:** remains **NO-GO** until remaining blockers close.

---

## 1. Remediated commit

Recorded after push (see §3). Scope:

| Area | Change |
|---|---|
| Live links (OPS-CI-001) | Homepage suburb chips use `locationHubPathFromAreaInput`; proxy 308 for non-hub `/locations/{short-slug}` |
| Privacy | Canonical remains `/privacy-policy`; `/privacy` already permanent-redirects in `next.config.ts` |
| Data deletion | Public `/data-deletion` + `/data-deletion/status`; Meta callback `POST /api/meta/data-deletion` |
| Docs | Meta plan, production Vercel manifest, backup/migration runbook (prepare only) |

---

## 2. Live-link defects and fixes

| Failing URL (production crawl) | Source | Correct fix | Implemented |
|---|---|---|---|
| `/locations/beacon-hill` | Homepage `MarketingAreasSection` (DB short slug) | Correct internal link → `/locations`; legacy target redirect 308 | Yes |
| `/locations/big-bay` | same | same | Yes |
| `/locations/bonnie-brook` | same | same | Yes |
| `/locations/maitland` | same | same | Yes |
| `/locations/noordhoek` | same | same | Yes |
| `/locations/muizenberg` | same | same | Yes |
| `/locations/melkbosstrand` | same | same | Yes |
| `/locations/sun-valley` | same | same | Yes |
| `/locations/zevenwacht` | same | same | Yes |
| `/locations/ysterplaat` | same | same | Yes |

**Not chosen:** invent 10 new hub pages; weaken or disable `validate:live-internal-links`.

**CI note:** The live-link job probes **production** (`https://shalean.co.za`). Target status becomes non-broken (308) only after **this commit is deployed to production**. Until then the draft PR live-link step may remain RED even though staging proves the fix. Emitter fix stops new short-slug hrefs after deploy.

---

## 3. Privacy / data-deletion endpoint results

| Route | Behaviour | Notes |
|---|---|---|
| `/privacy-policy` | 200, canonical `https://shalean.co.za/privacy-policy` | **Canonical** — keep; recommend Meta update to this URL |
| `/privacy` | 308 → `/privacy-policy` (`next.config.ts`) | Safe permanent redirect preserved |
| `/terms-of-service` | 200 | Unchanged |
| `/data-deletion` | 200 instructions + contact | No unsupported legal claims; **Legal review** flagged on page |
| `/data-deletion/status?code=` | 200 status (HMAC-verified code) | Noindex; no PII |
| `POST /api/meta/data-deletion` | Ack `{ url, confirmation_code }` | Verifies `signed_request`; **no automatic** customer/business delete; logs hashed Meta user id only |

**Meta App Dashboard (prepare — do not apply in this task):**

- Privacy Policy URL → `https://shalean.co.za/privacy-policy` (or leave `/privacy` which redirects)
- Data Deletion Request URL → `https://shalean.co.za/api/meta/data-deletion`
- User-facing instructions → `https://shalean.co.za/data-deletion`

---

## 4. Meta configuration and App Review plan (do not execute)

### 4.1 Immediate (Development mode; release-owner confirmation)

| Change | Immediate? | Notes |
|---|---|---|
| Add Valid OAuth Redirect URI `https://shalean.co.za/api/oauth/facebook/callback` | Yes (config) | Keep staging URI; same app can hold both |
| Privacy Policy URL → canonical privacy | Yes | Prefer `/privacy-policy` |
| Data Deletion Request URL → `/api/meta/data-deletion` | Yes | Requires production (or reachable HTTPS) deploy of this commit first |
| Keep app in **Development** | Yes | **Do not switch to Live** in this task |
| Facebook / Instagram provider flags remain `0` on production until gate | Yes | Fail-closed |

### 4.2 Require Meta App Review / Advanced Access

| Permission | Advanced Access / Review |
|---|---|
| `public_profile` | Advanced Access (Login for Business) |
| `pages_show_list` | App Review |
| `pages_manage_posts` | App Review |
| `pages_read_engagement` | App Review |
| `instagram_basic` | App Review |
| `instagram_content_publish` | App Review |

### 4.3 Require business verification

- Meta Business verification for the Shalean Business Manager
- App Review evidence: screencast of connect → select Page → publish (staging or controlled prod with flags off until approved)
- Test credentials / reviewer instructions for Login for Business
- Instagram: Professional account linked to Facebook Page; Login config IDs for production vs staging

### 4.4 Require release-owner explicit confirmation before

- Switching app **Development → Live**
- Enabling `MARKETING_PROVIDER_FACEBOOK` / `INSTAGRAM` on production
- Any production publish smoke

### 4.5 Rollback

- Switch Meta app back to Development
- Set provider flags `0` on Vercel Production
- Disconnect / pause connected accounts if any were created
- Do **not** reverse marketing migrations without a separate approved plan

---

## 5. Production Vercel manifest (prepare only — do not apply)

| Variable | Action | Value guidance |
|---|---|---|
| `MARKETING_OAUTH_ENCRYPTION_KEY` | **Add Production-only** | **Generate new** high-entropy key (production has `social_accounts = 0`; do not reuse staging). Never commit/log. |
| `INSTAGRAM_LOGIN_CONFIG_ID` | Add Production | Production Login for Business config id (not staging-named only) |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | Confirm Production | Existing Meta app credentials |
| `FACEBOOK_REDIRECT_URI` | Set Production | `https://shalean.co.za/api/oauth/facebook/callback` |
| `NEXT_PUBLIC_SITE_URL` | Confirm | `https://shalean.co.za` |
| `MARKETING_PROVIDER_FACEBOOK` | Keep / set `0` initially | Enable only after Meta Live + gate |
| `MARKETING_PROVIDER_INSTAGRAM` | Keep / set `0` initially | Same |
| `MARKETING_PROVIDER_X` / `GBP` / LinkedIn / Pinterest | `0` / absent | Fail-closed |

---

## 6. Backup / migration runbook (prepare only — do not execute)

**Production ref:** `tchayecuvzssixyxlvfu` — confirm at execution time.

**Five migrations (sequential):**

1. `20260716180000_mkt_001a_promotions_financial_access.sql`
2. `20260716180100_mkt_001a_publish_idempotency.sql`
3. `20260717120000_mkt_001b2_social_publish_jobs.sql`
4. `20260717180000_mkt_001g_instagram_ledger_provider.sql`
5. `20260718120000_mkt_001i_x_ledger_provider.sql`

**Release-day sequence:**

1. Freeze production DB-changing admin operations.
2. Confirm project ref `tchayecuvzssixyxlvfu`.
3. Create fresh encrypted logical backup via approved production backup procedure.
4. Verify backup completion, size, readability **without** restoring over production.
5. Record latest Supabase physical backup timestamp (was `2026-07-20 00:36:29 UTC` at preflight; re-check).
6. Record release start time + counts (`bookings`, `social_accounts`, `promotions`, etc.).
7. Apply the five migrations sequentially; verify each schema marker.
8. Deploy application with **all** marketing provider flags disabled.
9. Production health checks (`/api/health`, auth smoke, no social publish).
10. Retain logical backup per secure retention procedure.
11. Unfreeze after verification.
12. **PITR** remains disabled — treat physical + logical backup as the recovery model until add-on approved.

---

## 7. Remaining blockers (production GO)

1. Production application deploy of this remediation commit (required for live-link GREEN + Meta deletion URL).
2. Production Vercel env: encryption key + Instagram login config + production callback URI alignment.
3. Five marketing migrations still **absent** on production (after backup).
4. Meta: production callback URI, privacy/deletion URLs, Advanced Access / App Review, Business verification — app still **Development**.
5. PITR disabled; on-demand dashboard backup unavailable — logical backup mandatory on release day.
6. Provider flags must stay `0` until Meta Live + controlled gate.

---

## 8. Recommendation

**NO-GO** for production promotion / Meta Live / migrations.

**READY FOR META CONFIGURATION** only in the narrow sense of: staging+code remediation is ready for operators to **prepare** Development-mode Meta settings (privacy URL, deletion callback URL after prod HTTPS deploy, OAuth redirect URI) **without** switching to Live — subject to release-owner confirmation and after staging verification of this commit.
