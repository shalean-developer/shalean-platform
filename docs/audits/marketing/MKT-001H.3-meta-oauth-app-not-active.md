# MKT-001H.3 — Staging Meta OAuth “App not active”

**Date:** 2026-07-18  
**Target:** `staging` only  
**Production / `main`:** **NO-GO**

## Symptom

Staging Connect Facebook (or Instagram OAuth start) redirects to Meta and shows:

> App not active — This app is not accessible right now and the app developer is aware of the issue.

Graph API Explorer checks on **Shalean Social Publishing** succeed (`/me/permissions`, `/me/accounts`).

## Root cause (evidence-backed)

**Stale / mixed Meta app identity in Vercel Preview env**, not a broken OAuth code path.

| Evidence | Value |
| --- | --- |
| Staging deploy (pre-fix) | `dpl_J5pYtZwVoFjqSw4UTjfK2MvBmriJ` @ `345595ca` |
| OAuth start (2026-07-18T02:45:06Z) | `loginPurpose=facebook`, `usingLoginConfigId=true` |
| Config id in runtime log | masked `1645…` (same suffix as prior **Shalean Marketing** General config) |
| Redirect | `…/api/oauth/facebook/callback` on staging host (correct) |
| Vercel env | Duplicate `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` / `FACEBOOK_LOGIN_CONFIG_ID`: **Preview (staging)** *and* **Production, Preview** |
| Operator target app | **Shalean Social Publishing** (Instagram Graph API Login for Business) |

Code correctly uses Login for Business `config_id` **without** classic `scope` when a config id is set. The authorize URL therefore embeds whatever `FACEBOOK_APP_ID` + purpose-selected `*_LOGIN_CONFIG_ID` the Preview runtime has. If those still point at an inactive / retired app (or a config from a different app than `client_id`), Meta shows **App not active** before any Shalean callback runs.

This is **Vercel env scoping / app–config mismatch**, optionally worsened by a missing redeploy after env edits — **not** production code and **not** a CSRF bypass.

## Code path

1. UI **Connect Facebook** → `GET /api/oauth/facebook` → `getFacebookOAuthConfig("facebook")` → `FACEBOOK_LOGIN_CONFIG_ID`
2. UI **Connect Instagram** (when `INSTAGRAM_LOGIN_CONFIG_ID` set) → `GET /api/oauth/facebook?purpose=instagram` → `INSTAGRAM_LOGIN_CONFIG_ID`
3. `buildFacebookAuthUrl` → `https://www.facebook.com/{version}/dialog/oauth` with `client_id`, `redirect_uri`, `state`, `response_type=code`, `auth_type=rerequest`, and either `config_id` (+ `override_default_response_type=true`) **or** Page `scope` — never both.

Instagram Graph API Login for Business uses the **same** authorize endpoint shape; only the `config_id` (and purpose cookie) differs.

## Minimal remediation

### Operator (required for PASS)

1. In Meta → **Shalean Social Publishing**, copy App ID + App Secret + both Login for Business configuration IDs (General **and** Instagram Graph API).
2. In Vercel → project → **Preview** env:
   - Prefer **Preview (staging)** branch overrides only for Meta credentials.
   - Set `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI` (exact staging callback), `FACEBOOK_LOGIN_CONFIG_ID`, `INSTAGRAM_LOGIN_CONFIG_ID` from **the same** Social Publishing app.
   - Remove **Preview** from any older `FACEBOOK_*` / `INSTAGRAM_LOGIN_CONFIG_ID` rows that still target Production+Preview with Marketing/Hub values (do **not** change Production values used by `main`).
3. Redeploy **staging** after env edits.
4. Hit `/api/health/environment` and confirm redacted `marketingOAuth.facebook.appIdMasked` / `loginConfigIdMasked` suffixes match Social Publishing (not the old Marketing `1645…` config unless that ID truly belongs to Social Publishing).
5. Retest Connect Facebook, then Connect Instagram.

### Code (this change)

- Redacted App ID + config ID + redirect host/path + param inventory on `oauth_started`
- Health endpoint exposes masked Facebook vs Instagram identity + git SHA
- Login for Business URL sets `override_default_response_type=true` with `config_id`
- Regression tests for app/config pair, staging redirect, no scope+config hybrid, secret redaction

## Governance status

| Action | Decision |
| --- | --- |
| Diagnose staging Meta OAuth | **GO** |
| Staging env realignment + redeploy | **GO** |
| Production / `main` credential changes | **NO-GO** |
| Recreate Meta app / rotate secrets / broaden permissions | **NO-GO** (unless operator separately chooses) |
| Claim staging PASS without post-redeploy runtime evidence | **NO-GO** |

## Operator retest checklist

- [ ] `/api/health/environment` → `deployment=staging`, masked App ID suffix matches Social Publishing
- [ ] Masked `facebook.loginConfigIdMasked` matches General config on that app
- [ ] Masked `instagram.loginConfigIdMasked` matches Instagram Graph API config on that app
- [ ] Connect Facebook → Meta dialog loads (no “App not active”)
- [ ] Connect Instagram → uses `purpose=instagram` (log `loginPurpose=instagram`)
- [ ] Runtime log `oauth_started` shows `hasConfigId=true`, `hasScope=false`, `incompatibleLoginForBusinessCombo=false`
- [ ] Callback saves connection / page pick as before
- [ ] Production untouched
