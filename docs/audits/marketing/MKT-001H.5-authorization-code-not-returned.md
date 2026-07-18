# MKT-001H.5 — Authorization code not returned

**Date:** 2026-07-18  
**Target:** `staging` only  
**Production / `main`:** **NO-GO**

## Symptom

UI toast: **“The provider did not return an authorization code.”**  
(`error=missing_code` from Facebook OAuth callback → Connected Accounts)

Preceded by Meta Business Extension: **“Sorry, something went wrong.”** after Facebook login + Instagram asset selection.

## Verdict (evidence to date)

| Question | Answer |
| --- | --- |
| Did Meta redirect to our callback? | **Yes** — staging logs show `GET /api/oauth/facebook/callback` 307 at 03:56:16Z and 03:56:37Z |
| Did Meta send `error=`? | **No evidence of `error` branch** — that path logs `callback_failed`; those attempts did not |
| Did Meta send `code=`? | **Almost certainly no** — UI reached `missing_code` (`!code \|\| !state`) |
| Is the callback handler wrong? | **No** — it correctly rejects missing `code`/`state`; it previously **did not log** this path, so we could not see Meta’s query keys |
| Where does failure start? | **Inside Meta Business Extension** after consent UI, before a successful OAuth redirect with `code` (or with a broken redirect omitting `code`) |

Earlier operator screenshot showed a `code=` on Meta’s own URL  
`facebook.com/facebook_business_extension/oauth/?code=…` — that is **not** a redirect to Shalean. Meta can mint a code on its extension host and still fail before forwarding it to `redirect_uri`.

## Runtime evidence (redacted)

| Time (UTC) | Event | Deploy / SHA | Notes |
| --- | --- | --- | --- |
| 03:53:05 | `oauth_started` | `dpl_9K2WBmvp…` @ `4140797b` | Still logged `authType: rerequest` (pre–PR #66 code path) |
| 03:56:16 | `GET …/callback` 307 | `dpl_9K2WBmvp…` | No `callback_failed` / no `callback_received` log (silent `missing_code`) |
| 03:56:37 | `GET …/callback` 307 | `dpl_9K2WBmvp…` | Same |
| Alias check | staging alias | `dpl_CWTcJu6…` @ `ca5586d8` | PR #66 (omit `auth_type`) is aliased, but recent OAuth starts still attributed to older deploy in logs — operator must hard-refresh / use git-staging URL only |

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

## Governance

| Action | Decision |
| --- | --- |
| Callback query diagnostics | **GO** |
| Blame callback exchange logic | **NO-GO** until redacted `callback_received` proves a `code` arrived |
| Production / `main` | **NO-GO** |
| Staging PASS | **NO-GO** without post-fix `oauth_started` (`authType: null`) + successful callback with `code` |
