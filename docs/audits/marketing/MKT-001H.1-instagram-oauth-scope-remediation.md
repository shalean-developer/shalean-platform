# MKT-001H.1 — Instagram OAuth Scope Remediation

**Parent:** MKT-001H — Facebook Connected Accounts OAuth  
**Follow-on:** MKT-001H.1.1 — Invalid Scopes hotfix (2026-07-17)  
**Target:** `staging` only — do **not** merge to `main` or deploy production  
**Date:** 2026-07-17  

---

## Problem

Facebook Connected Accounts OAuth succeeded and Meta Business Suite showed a linked Instagram Business account, but Instagram discovery in Shalean returned:

> No Instagram professional account is linked to this Facebook Page.

Root cause: Page tokens lacked Instagram Graph permissions needed for `instagram_business_account`.

## MKT-001H.1 attempt

Added `instagram_basic` + `instagram_content_publish` to raw Facebook OAuth `scope`.

### Staging result — BLOCKED

Meta Login dialog returned:

> Invalid Scopes: instagram_basic, instagram_content_publish.  
> This message is only shown to developers. Users of your app will ignore these permissions if present.

Those permission **names are still valid** in Meta’s Facebook Login for Business permission table, but they are **not grantable via raw `scope`** until the Meta app has them enabled (Instagram product + Login for Business configuration / Use Cases).

## MKT-001H.1.1 remediation

1. **Hotfix:** remove Instagram scopes from default `FACEBOOK_OAUTH_SCOPES` so Facebook Page connect works again.
2. Keep target Instagram scopes documented as `FACEBOOK_INSTAGRAM_OAUTH_SCOPES` (includes dependency `pages_read_user_content`).
3. Support optional `FACEBOOK_LOGIN_CONFIG_ID` — when set, OAuth uses Facebook Login for Business `config_id` instead of raw `scope`.

### Operator Meta App Dashboard steps (required for Instagram)

1. Confirm the Meta app type is **Business**.
2. Add the **Instagram** product (Instagram API with Facebook Login).
3. Under **Facebook Login for Business**, create a configuration that includes at least:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `pages_read_user_content`
   - `instagram_basic`
   - `instagram_content_publish`
4. Copy the configuration id → set staging env `FACEBOOK_LOGIN_CONFIG_ID`.
5. Redeploy / reconnect Facebook, approve all permissions, then retry Instagram discovery.

Do **not** put `instagram_business_*` scopes on the Facebook Login dialog — those are for **Instagram Login** (`instagram.com/oauth`), a different auth model.

## Governance status (until staging smoke passes)

| Gate | Status |
| --- | --- |
| Facebook OAuth (Page scopes) | **PASS** after H.1.1 hotfix |
| Instagram discovery | **BLOCKED** until Login for Business config + reconnect |
| MKT-001H overall | **CONDITIONAL PASS** |
| Production / `main` | **NO-GO** |

### Authoritative statement

> **MKT-001H.1 / H.1.1: CONDITIONAL PASS. Instagram scopes must be granted via Facebook Login for Business config_id (or App Dashboard–enabled permissions), not raw invalid scopes. Production and `main` remain NO-GO.**

## Test / build evidence

| Gate | Result |
| --- | --- |
| OAuth tests | Page scopes + `config_id` path + log redaction |
| Instagram discovery messaging | Retained from H.1 |
| Marketing regression | Run on hotfix branch |
| Production / `main` | **NO-GO** |
