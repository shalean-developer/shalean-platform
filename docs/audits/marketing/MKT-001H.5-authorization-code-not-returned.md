# MKT-001H.5 — Authorization code not returned

**Date:** 2026-07-18  
**Target:** `staging` only  
**Production / `main`:** **NO-GO**

## Symptom

UI toast: **“The provider did not return an authorization code.”**  
(`error=missing_code` from Facebook OAuth callback → Connected Accounts)

Preceded by Meta Business Extension: **“Sorry, something went wrong.”** after Facebook login + Instagram asset selection.

## Verdict (post–diagnostics deploy)

| Question | Answer |
| --- | --- |
| Did Meta redirect to our callback? | **Yes** |
| Did Meta send `code=`? | **No** on the failing completes |
| Did Meta send error params? | **Yes** on the clean failure (04:15:54Z) |
| Exact Meta error | `error=access_denied`, `error_reason=user_denied`, `error_code=200`, `error_description` length **17** (= **`Permissions error`**) |
| Is the callback handler wrong? | **No** — it correctly maps Meta’s denial; Shalean never received a grantable `code` |
| Root cause class | **Meta Login for Business permissions / app mode** — not CSRF, not redirect URI mismatch, not missing `code` parsing |

Known Meta behavior: Login for Business in **Development** mode often completes the UI then redirects with  
`access_denied` + `error_code=200` + `Permissions error` + `user_denied` (looks like cancel). Fix: set app to **Live**, ensure Login config permissions/assets are grantable.

## Runtime evidence (redacted)

| Time (UTC) | Event | Deploy / SHA | Notes |
| --- | --- | --- | --- |
| 04:15:43 | `oauth_started` | `dpl_2PTFLybk…` @ `4ed806e4` | `authType: null`, config `…1207`, purpose `facebook` |
| 04:15:54 | `callback_received` | same | `hasCode: false`, `hasState: true`, params `action,error,error_code,error_description,error_reason,state` |
| 04:15:54 | `callback_failed` | same | `error=access_denied`, `errorReason=user_denied`, `errorCode=200`, description length 17 |
| 04:11:38 | `callback_received` | same | **Empty query** (`paramKeys: null`) → `missing_code` (stray / aborted navigation after Meta error page) |
| 03:53–03:56 | older | `4140797b` | Pre-diagnostics; silent `missing_code` before query logging existed |

Authorize URL intent after PR #66 (`ca5586d8`):

- `config_id` + `response_type=code` + `override_default_response_type=true`
- **no** `scope`, **no** `auth_type`
- Redirect: `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app/api/oauth/facebook/callback`
- App masked `…5561`, FB config `…1207`, IG config `…4849`

## Login for Business vs Instagram Graph API

| Purpose | Env | Config suffix (staging health) | UI entry |
| --- | --- | --- | --- |
| Facebook (General) | `FACEBOOK_LOGIN_CONFIG_ID` | `…1207` | Connect Facebook → `/api/oauth/facebook` |
| Instagram Graph API | `INSTAGRAM_LOGIN_CONFIG_ID` | `…4849` | Connect Instagram → `/api/oauth/facebook?purpose=instagram` |

Both use the same callback path and the same App ID. Business Extension asset pickers can appear for either config depending on dashboard assets/permissions.

## Meta dashboard checklist (operator)

On **Shalean Social Publishing** (App ID ending `5561`):

- [ ] App Domains includes `shalean-platform-git-staging-shalean-cleaning-services.vercel.app`
- [ ] Valid OAuth Redirect URIs includes the **exact** callback URL above (https, no trailing slash)
- [ ] Client OAuth Login = enabled
- [ ] Web OAuth Login = enabled
- [ ] Login for Business configs `…1207` (General) and `…4849` (Instagram Graph API) are **active**, token type = **User** access token (not System User unless exchange path is updated)
- [ ] Config assets/permissions match intended Pages + IG Professional account
- [ ] Retry only against git-staging URL after deploy with `authType: null` in `oauth_started`

## Code change in this investigation

Diagnostic only (no exchange/CSRF behavior change):

- Log `callback_received` with redacted query inventory (`hasCode`, lengths, `error` / `error_reason`, param keys)
- Log `missing_code` / `oauth_failed` with the same inventory

## Operator question (needed for next cut)

After selecting Instagram and clicking Continue, does the browser address bar briefly show:

1. `facebook.com/facebook_business_extension/oauth/?code=…` then the Meta error page, or  
2. Jump straight to Meta’s error page with **no** `code=` anywhere, or  
3. Briefly hit `…/api/oauth/facebook/callback?code=…` then fail later?

(1) matches current evidence (code on Meta host only). (3) would mean a different bug (cookie/state or exchange).

## Operator next steps

1. Meta App Dashboard → **Shalean Social Publishing** (`…5561`) → switch app to **Live** (Login for Business often fails in Development with Permissions error).
2. Confirm Login configs `…1207` / `…4849` include grantable Page (+ IG) permissions/assets and token type **User**.
3. Retest Connect Facebook on git-staging; expect either `code` success or a clear `oauth_permissions_error` toast (not opaque `missing_code`).
4. For Instagram-specific config, use **Connect Instagram** (`purpose=instagram`, config `…4849`).

## Governance

| Action | Decision |
| --- | --- |
| Callback query diagnostics | **GO** (landed) |
| Surface Meta Permissions error distinctly | **GO** |
| Blame callback exchange logic | **NO-GO** — Meta never returned `code` |
| Production / `main` | **NO-GO** |
| Staging PASS | **NO-GO** until Live app + successful `code` callback |
