# MKT-001H — Facebook Connected Accounts OAuth

**Branch:** `feature/mkt-001h-facebook-connected-accounts-oauth`  
**Base:** `staging` (`b692b4dc` / MKT-001G merge)  
**Target:** `staging` only — do **not** merge to `main` or deploy production  
**Date:** 2026-07-17

---

## Executive Summary

MKT-001H replaces the manual Facebook Page env-token path with a production-grade **Connected Accounts Meta OAuth** flow, mirrored on the existing Google Business OAuth pattern.

Operators can **Connect / Reconnect / Disconnect** Facebook from the UI. Page tokens are **encrypted** into `social_accounts` (`provider = facebook`) using `MARKETING_OAUTH_ENCRYPTION_KEY`. Publishing resolves:

1. Active encrypted Connected Accounts record  
2. Explicit emergency/local env fallback (`FACEBOOK_ALLOW_ENV_TOKEN_FALLBACK`)  
3. Otherwise **fail closed**

Env vars `FACEBOOK_PAGE_ID` / `FACEBOOK_PAGE_ACCESS_TOKEN` remain as a **documented emergency/local fallback only**, disabled by default.

**Verdict (pre-staging):** **CONDITIONAL GO** for staging verification. **NO-GO** for production until exact-SHA staging OAuth + controlled publish smoke pass.

---

## Current-State Gap (before MKT-001H)

| Capability | Before | After |
|---|---|---|
| Connect UI | “Facebook uses server env tokens (no OAuth UI)” | Connect / Reconnect / Manage / Disconnect |
| Token storage | Process env only | Encrypted `social_accounts` |
| Page selection | Manual env Page ID | `/me/accounts` discovery + explicit pick when multiple |
| Recovery | Vercel env update + redeploy | Reconnect Facebook OAuth |
| Publish resolution | Env only | Connected account → optional env fallback → fail closed |
| Instagram (MKT-001G) | Env Page token for discovery | Prefers connected Facebook Page token; env fallback unchanged policy |

---

## OAuth Architecture

```text
Admin (Connected Accounts)
  → GET /api/oauth/facebook
      • require admin
      • require MARKETING_PROVIDER_FACEBOOK
      • CSRF state (httpOnly hashed cookie, 10m TTL, single-use)
      • redirect Meta dialog
  → Meta consent (pages_show_list, pages_read_engagement, pages_manage_posts,
      instagram_basic, instagram_content_publish)
  → GET /api/oauth/facebook/callback
      • validate state (reject missing/expired/mismatched/replay)
      • exchange code → short-lived user token
      • exchange → long-lived user token
      • GET /me/accounts (Page discovery)
      • upsert social_accounts (encrypted)
      • redirect Connected Accounts (pick=1 if multiple Pages)
  → POST select_facebook_page (when multiple / pending)
  → Publish uses resolveFacebookPublishConfig()
```

Key modules:

- `apps/web/lib/oauth/metaFacebookOAuth.ts`
- `apps/web/lib/oauth/metaFacebookSaveError.ts`
- `apps/web/lib/promotions/facebookConnectedAccount.ts`
- `apps/web/app/api/oauth/facebook/route.ts`
- `apps/web/app/api/oauth/facebook/callback/route.ts`

---

## Data Flow

1. **OAuth start** — correlation ID + hashed state cookie; no secrets in URL beyond Meta’s code exchange.  
2. **Callback** — server-only token exchange; browser only receives sanitized redirect query (`error`, `reason`, `connected`, `pick`, `cid`).  
3. **Persistence** — Page token in `access_token` (encrypted); long-lived user token in `refresh_token` (encrypted) for re-discovery / select.  
4. **Publish** — decrypt Page token; never return token to client.  
5. **Auth failure (Graph 190/401)** — mark connection `error`, UI shows Reconnect.  
6. **Disconnect** — soft-disconnect: null token columns, status `disconnected`, actor + timestamp in metadata; publish history retained.

---

## Permission Model

Requested scopes (documented minimum — MKT-001H.1):

| Permission | Purpose |
|---|---|
| `pages_show_list` | List Pages via `/me/accounts` |
| `pages_read_engagement` | Read Page engagement needed for healthy publish surface |
| `pages_manage_posts` | Publish feed/photo as the Page |
| `instagram_basic` | Read Page-linked `instagram_business_account` for IG discovery |
| `instagram_content_publish` | Instagram Content Publishing API |

**Page eligibility:** tasks must include `CREATE_CONTENT` or `MANAGE`. Ineligible Pages are shown with reason and cannot be saved.

**Instagram:** discovered via the Page-linked Professional account using the connected Page token after Facebook OAuth grants the Instagram scopes above. See `MKT-001H.1-instagram-oauth-scope-remediation.md`.

Reconnect uses `auth_type=rerequest` so operators can approve newly added Instagram permissions.

---

## Token Lifecycle

| Stage | Behavior |
|---|---|
| Short-lived user token | Code exchange only |
| Long-lived user token | Stored encrypted for Page re-discovery |
| Page token | Stored encrypted; used for publish |
| Expiry / invalid | Connection marked error; publish blocked; Reconnect |
| Reconnect | Upsert same `provider=facebook` row (no uncontrolled duplicates) |
| Disconnect | Token material destroyed; history kept |

Internal source markers (logs/observability only): `connected_account` | `environment_fallback`.

---

## Encryption and Storage

- Key: `MARKETING_OAUTH_ENCRYPTION_KEY` (same envelope as GBP/IG)  
- No plaintext tokens in client state, localStorage, URL, logs, analytics, or audit metadata  
- RLS unchanged (`social_accounts` service_role)  
- **No migration required** — existing `social_accounts` schema already allows `provider = 'facebook'`

---

## Reconnect and Disconnect

- **Reconnect:** same OAuth start; upsert updates existing row; Page reselection if needed.  
- **Disconnect:** explicit admin confirmation in UI; future publish blocked; Instagram not auto-disconnected (separate `social_accounts` row).  
- Disconnect warning states Instagram is independent unless operators share credential assumptions.

---

## Fallback Policy

| Setting | Effect |
|---|---|
| `FACEBOOK_ALLOW_ENV_TOKEN_FALLBACK` unset/`0` | **Default** — no silent env publish |
| `=1\|true\|on\|enabled` | Allow `FACEBOOK_PAGE_*` after connected-account miss |
| UI | Diagnostics `<details>` only — not the primary recovery path |

Production release manifests must state whether fallback is allowed (default: **not allowed**).

---

## Security Review

| Control | Status |
|---|---|
| OAuth state single-use + expiry | Yes (cookie cleared before exchange; 600s maxAge) |
| Admin authorization server-side | Yes (cookie admin or `requireAdminApi`) |
| Provider enablement fail-closed | Yes (`MARKETING_PROVIDER_FACEBOOK`) |
| Secrets never in browser | Yes |
| Tokens encrypted at rest | Yes |
| Sanitized Meta errors | Yes (`metaFacebookSaveError`) |
| Log redaction | Yes (`logFacebookOAuthEvent` strips token/secret keys) |
| Account replacement explicit | Yes (`confirmReplace`) |
| CSRF / replay resistance | Yes (hashed state + single-use clear) |

---

## Test Evidence

Focused suites:

- `lib/oauth/__tests__/metaFacebookOAuth.test.ts`
- `lib/promotions/__tests__/mkt001hFacebookOAuth.test.ts`
- `lib/promotions/__tests__/facebookPublish.test.ts` (updated reconnect copy)
- `lib/promotions/__tests__/mkt001gInstagram.test.ts` (regression)

### Pre-merge gates (2026-07-17)

| Gate | Result |
|---|---|
| Focused MKT-001H + OAuth tests | **PASS** |
| Marketing regression (`lib/promotions` + oauth save-error) | **PASS** — 158/158 |
| Critical tests (`test:critical`) | **PASS** — 134/134 |
| Typecheck | **PASS** |
| Lint (changed files) | **PASS** — 0 errors (2 pre-existing `set-state-in-effect` warnings on Connected Accounts load effects) |
| Production build | **PASS** via `next build --webpack` (routes include `/api/oauth/facebook` + callback). Default Turbopack `npm run build` hits a pre-existing local monorepo `@shalean/*` resolve failure unrelated to this branch; typecheck already PASS. |
| Migration validation (`npm run db:migrations:validate`) | **PASS** — 16 active migrations; no new migration on this branch |

Remaining before production: exact-SHA staging OAuth + controlled publish smoke.

---

## Migration Impact

**None.** Uses existing `social_accounts` columns + `metadata` JSON.

---

## Rollback Strategy

1. Disable `MARKETING_PROVIDER_FACEBOOK` (fail-closed).  
2. Optionally soft-disconnect Facebook row.  
3. Revert feature branch from staging.  
4. Env fallback remains available only if explicitly enabled for emergency smoke.  
5. GBP / Instagram rows unaffected by Facebook disconnect.

---

## Residual Risks

1. Meta App review / permission approval for production apps.  
2. Long-lived user token expiry still requires periodic reconnect (Page tokens from `/me/accounts` are typically long-lived but tied to user/password changes).  
3. Instagram still depends on a valid Facebook Page credential path.  
4. Staging Meta App redirect URI must match `FACEBOOK_REDIRECT_URI` exactly.  
5. Operators may still have legacy env tokens; with fallback disabled they are ignored (intentional).

---

## GO / CONDITIONAL GO / NO-GO

| Gate | Decision |
|---|---|
| Code complete on feature branch | **CONDITIONAL GO** |
| Staging exact-SHA OAuth + publish smoke | Pending → see `MKT-001H-staging-verification.md` |
| Production authorization | **NO-GO** until staging passes |
| GBP | Independently disabled / NO-GO |
| Instagram I1–I9 | Remains conditional if sharing Meta operator connection |

---

## Required staging env (new)

```text
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_REDIRECT_URI=https://<staging-host>/api/oauth/facebook/callback
MARKETING_PROVIDER_FACEBOOK=1
FACEBOOK_ALLOW_ENV_TOKEN_FALLBACK=0
MARKETING_OAUTH_ENCRYPTION_KEY=<existing>
```
