# MKT-001H.6 — Deep Meta OAuth Connection Failure Audit

**Date:** 2026-07-18  
**Target:** `staging` only  
**Production / `main`:** **NO-GO**  
**Branch (remediation):** `fix/mkt-001h6-meta-oauth-deep-audit`

---

## 1. Executive verdict

Staging Facebook/Instagram Connect cannot complete because **Meta Login for Business denies the grant** after a correctly shaped authorize request. Runtime proves Shalean sends `config_id` (Facebook General `…1207`, App `…5561`) with no classic `scope` / `auth_type`. The callback returns `access_denied` + `error_code=200` + description length 17 (`Permissions error`) and **no authorization code**.

The visible Meta string **“Invalid parameter: config_id is required”** is **not** produced by the current staging authorize URL (`hasConfigId=true`). It is the Meta failure mode when Login for Business is required but `config_id` is omitted — historically reachable via the code’s classic-scope fallback when env config IDs were missing/stale. That fallback is now **fail-closed**.

| Claim | Status |
| --- | --- |
| Facebook Connect PASS | **NO-GO** (Meta Permissions error blocks `code`) |
| Instagram Connect PASS | **NO-GO** (depends on FB grant + Page token; current stored Page token returns Graph **190**) |
| Production / `main` | **NO-GO** |
| Staging investigation + hardening | **GO** (this audit) |

**Governance decision: CONDITIONAL PASS** for diagnostic/hardening code on staging only. Connection itself remains **NO-GO** until Meta app mode / Login config permissions allow a grantable `code`.

---

## 2. Exact root cause

**Primary (current connect failure):** Meta Login for Business **Permissions error** on authorize completion — not Shalean callback parsing, CSRF, token exchange, or persistence.

Evidence (deploy `dpl_2ucp7T3CWdnjLGSNUrAKoHLKSGkp` @ `02c805a2`):

| Stage | Result |
| --- | --- |
| `oauth_started` | `hasConfigId=true`, `hasScope=false`, `authType=null`, `override_default_response_type=true`, purpose `facebook`, config `…1207`, app `…5561` |
| Meta dialog | Completes UI then denies |
| `callback_received` | `hasCode=false`, `error=access_denied`, `error_code=200`, `errorDescriptionLength=17`, `hasState=true` |
| First failing stage | **Meta grant** (before code exchange) |

**Secondary (latent):** OAuth state cookies sometimes absent on callback (`hasStateCookie=false`, `correlationId=fb-oauth-unknown`). Would fail CSRF even after Meta returns `code`. Hardened by attaching cookies to the `NextResponse.redirect` / JSON response.

**Tertiary (Instagram discovery):** Stored Facebook Page token for page `1028…` returns Graph **190** (`OAuthException`) on `ig_page_lookup` — stale/revoked token from prior Meta app migrations. Cannot discover IG until Facebook reconnect succeeds with a fresh Page token.

**Historical (resolved / not current):**

| Symptom | Cause | Status |
| --- | --- | --- |
| App not active | Stale Marketing app/config (`1645…`) in Preview | Env now `…5561` / `…1207` / `…4849` |
| Invalid Scopes | Raw Instagram scopes on classic OAuth | Fixed (config_id path) |
| Business Extension “Sorry…” | `auth_type` + `config_id` combo | Fixed (PR #66) |
| Opaque missing_code | Meta Permissions error without diagnostics | Fixed (H.5) |
| config_id is required | Classic scope URL without config_id on LfB app | Fail-closed in H.6 |

---

## 3. First failing stage

```
UI Connect Facebook
→ GET /api/oauth/facebook                    ✅
→ env resolve + FACEBOOK_LOGIN_CONFIG_ID     ✅ (…1207)
→ buildFacebookAuthUrl (config_id, no scope) ✅
→ Meta dialog/oauth                          ❌ Permissions error (no code)
→ callback / token exchange / discovery / save  (not reached for success path)
```

---

## 4. Evidence table (redacted)

| Time (UTC) | Event | Deploy / SHA | Notes |
| --- | --- | --- | --- |
| 05:47:14 | `oauth_started` | `dpl_2ucp7T3…` @ `02c805a2` | `hasConfigId=true`, FB `…1207`, IG present `…4849`, app `…5561` |
| 05:45:02 | `callback_received` / `callback_failed` | same | Permissions error; `hasStateCookie=false` |
| 05:45–05:47 | `ig_page_lookup` | same | Graph **190** on page `1028…` |
| Prior (H.5) | same Permissions pattern | `dpl_2PTFLybk…` @ `4ed806e4` | Confirms non-regression of Meta denial |
| Prior (H.3) | App not active | older | Stale Marketing config prefix |

Authorize shape (current contract):

- `client_id` masked `…5561`
- `config_id` masked `…1207` (facebook) / `…4849` (instagram)
- `response_type=code`
- `override_default_response_type=true`
- **no** `scope`, **no** `auth_type`, **no** `business_id` / `extras`
- redirect host: `shalean-platform-git-staging-shalean-cleaning-services.vercel.app`
- path: `/api/oauth/facebook/callback`
- graph: `v22.0`

---

## 5. Environment matrix

| Variable | Read by | Required FB | Required IG | Fallback | Fail-closed? |
| --- | --- | --- | --- | --- | --- |
| `FACEBOOK_APP_ID` | `getFacebookOAuthConfig` | Yes | Yes (shared) | `META_APP_ID` | Yes (no cfg → 503) |
| `FACEBOOK_APP_SECRET` | same | Yes | Yes | `META_APP_SECRET` | Yes |
| `FACEBOOK_REDIRECT_URI` | same | Yes | Yes | `META_FACEBOOK_REDIRECT_URI` → `NEXT_PUBLIC_SITE_URL`+callback | Yes |
| `FACEBOOK_LOGIN_CONFIG_ID` | `resolveLoginConfigId(facebook)` | **Yes (LfB)** | No | `META_FACEBOOK_LOGIN_CONFIG_ID` | **Yes (H.6)** |
| `INSTAGRAM_LOGIN_CONFIG_ID` | `resolveLoginConfigId(instagram)` | No | **Yes (LfB)** | `META_INSTAGRAM_LOGIN_CONFIG_ID` only (**no** FB config fallback after H.6) | **Yes (H.6)** |
| `MARKETING_PROVIDER_FACEBOOK` | registry / start route | Yes (`=1`) | Yes (shared gate) | unset=off | Yes |
| `MARKETING_PROVIDER_INSTAGRAM` | registry / start (ig purpose) | No | Yes (`=1`) | unset=off | Yes |
| `MARKETING_OAUTH_ENCRYPTION_KEY` | tokenEncryption / save | Yes (persist) | Yes (persist) | legacy `SOCIAL_TOKEN_ENCRYPTION_KEY` decrypt | Yes on write |
| `FACEBOOK_GRAPH_API_VERSION` | graph helpers | No | No | `WHATSAPP_GRAPH_API_VERSION` → `v22.0` | N/A |

**Architecture proven from code:** separate Facebook General vs Instagram Graph API config IDs (not one shared ID).

Runtime identity (from `oauth_started` / prior health evidence): App `…5561`, FB config `…1207`, IG config `…4849` — consistent with **Shalean Social Publishing**.

**Vercel scoping note:** CLI in this workspace is linked to a personal team (`farais-projects…/web`), not `shalean-cleaning-services/shalean-platform`. Env row inventory must be confirmed in the Vercel dashboard for team `shalean-cleaning-services`. H.3 previously recorded duplicate Preview vs Production+Preview `FACEBOOK_*` rows — operators should keep Social Publishing values on Preview/`staging` only and avoid Production+Preview rows that can shadow Preview.

Unauthenticated `/api/health/environment` is blocked by **Vercel Deployment Protection** (SSO HTML). Use an admin session or share link that completes SSO; health now also exposes `envAliasPresence` + `*LoginConfigReady` flags (no secrets).

---

## 6. Code-path map

| Entry | UI / route | Purpose | Config ID |
| --- | --- | --- | --- |
| Connect / Reconnect Facebook | `ConnectedAccountsPanel` → `window.location.assign("/api/oauth/facebook")` | `facebook` (default) | `FACEBOOK_LOGIN_CONFIG_ID` |
| Connect / Reconnect Instagram | `POST …/publish-instagram` `{action:connect}` → if `INSTAGRAM_LOGIN_CONFIG_ID` set → assign `/api/oauth/facebook?purpose=instagram` | `instagram` | `INSTAGRAM_LOGIN_CONFIG_ID` |
| Shared start | `GET /api/oauth/facebook` | query `purpose` → cookie `fb_oauth_purpose` | purpose-selected |
| Callback | `GET /api/oauth/facebook/callback` | cookie purpose (default facebook) | re-resolve config for exchange |
| Token exchange | `exchangeFacebookAuthorizationCode` + long-lived | — | app id/secret/redirect |
| Page discovery | `discoverFacebookPages` → `/me/accounts` | — | user token |
| IG discovery | `saveInstagramConnection` → Page `instagram_business_account` | after FB save when purpose=instagram | Page token |
| Persistence | `saveFacebookOAuthConnection` upsert `onConflict: provider` | encrypt with marketing key | — |

There is **no** `/api/oauth/instagram` route.

Purpose survival: query → cookie → callback read. Purpose is **not** embedded in signed state; cookie loss defaults purpose to `facebook`.

---

## 7. Minimal patch (this change)

1. **Fail-closed** if purpose-selected Login for Business `config_id` is missing — never redirect a classic `scope` authorize URL to Meta.
2. **Instagram purpose** no longer falls back to Facebook General config ID.
3. Attach OAuth cookies on the **redirect/JSON `NextResponse`** (not only `cookies()` side effects).
4. Health: `facebookLoginConfigReady` / `instagramLoginConfigReady` + `envAliasPresence` (duplicate alias risk flags).
5. UI toast for `login_config_missing`.
6. Regression tests for purpose routing, fail-closed missing config, alias risk, redaction.

Does **not**: recreate Meta app, rotate secrets, broaden permissions, change production/main, manually edit DB, rewrite the integration.

---

## 8. Tests run and results

```text
npx vitest run lib/oauth/__tests__/metaFacebookOAuth.test.ts
# ✓ 21 passed (21)
```

---

## 9. Staging deployment (pre-patch baseline)

| Field | Value |
| --- | --- |
| Alias | `shalean-platform-git-staging-shalean-cleaning-services.vercel.app` |
| Deployment ID | `dpl_2ucp7T3CWdnjLGSNUrAKoHLKSGkp` |
| Git SHA | `02c805a227140fe538a8ddfa455f30c111eb1786` |
| Branch | `staging` |
| Status | READY |
| Environment | Preview (branch alias) |

Post-merge: record new deployment ID + SHA here after Vercel builds `staging`.

---

## 10. Operator retest checklist

1. Meta App Dashboard → **Shalean Social Publishing** (`…5561`) → set app **Live** (or ensure Development testers can grant Login for Business assets).
2. Confirm Login configs `…1207` (General) and `…4849` (Instagram Graph API) are active, token type **User**, permissions/assets include the target Page + IG Professional account.
3. Valid OAuth Redirect URI exact match:  
   `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app/api/oauth/facebook/callback`
4. After H.6 deploy: `/api/health/environment` (authenticated) → `facebookLoginConfigReady=true`, `instagramLoginConfigReady=true`, suffixes `…5561` / `…1207` / `…4849`, check `envAliasPresence` for duplicate alias risk.
5. Connect Facebook → logs: `oauth_started` with `hasConfigId=true`, `hasScope=false`, `authType=null`.
6. Expect either success (`code` → page pick/save) **or** clear `oauth_permissions_error` toast — not opaque `missing_code`, not Meta `config_id is required`.
7. Callback log: `hasStateCookie=true` and correlation ID ≠ `fb-oauth-unknown` when Meta returns to our host.
8. Connect Instagram → `loginPurpose=instagram`, config `…4849`.
9. Confirm Graph Explorer still works for the same app (control).
10. Production / `main` untouched.

---

## 11. Request variant matrix (code contract)

| Variant | Expected Shalean behavior |
| --- | --- |
| A. Facebook General config | `config_id=FB`, no scope, override=true |
| B. Instagram Graph config | `purpose=instagram`, `config_id=IG` |
| C. Missing config ID | **Blocked** before redirect (`login_config_missing`) |
| D. Stale/empty env | Same as C / alias risk in health |
| E. config_id + scope | Forbidden (`incompatibleLoginForBusinessCombo`) |
| F. config_id without scope | **Required** happy path |
| G. auth_type omitted | **Required** with config_id |
| H. auth_type=rerequest | Only classic path (unreachable via start route) |
| I. override present | Required with config_id |
| J. override absent | Invalid for LfB code grant |

---

## 12. Governance decision

| Gate | Decision |
| --- | --- |
| Staging deep audit complete | **PASS** |
| Staging Connect Facebook end-to-end | **NO-GO** (Meta Permissions) |
| Staging Connect Instagram end-to-end | **NO-GO** |
| Fail-closed + cookie harden merge to staging | **CONDITIONAL PASS** |
| Production / `main` | **NO-GO** |

**Overall: CONDITIONAL PASS** — root cause for the current deny is proven at Meta grant; Shalean authorize shape is correct; remaining connection PASS requires Meta Live/config grantability plus post-deploy cookie verification.
