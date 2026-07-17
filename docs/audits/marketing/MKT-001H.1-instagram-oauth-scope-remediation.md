# MKT-001H.1 — Instagram OAuth Scope Remediation

**Parent:** MKT-001H — Facebook Connected Accounts OAuth  
**Target:** `staging` only — do **not** merge to `main` or deploy production  
**Date:** 2026-07-17  

---

## Problem

Facebook Connected Accounts OAuth succeeded and Meta Business Suite showed a linked Instagram Business account, but Instagram discovery in Shalean returned:

> No Instagram professional account is linked to this Facebook Page.

Root cause: `FACEBOOK_OAUTH_SCOPES` omitted `instagram_basic` / `instagram_content_publish`. Meta’s Page field `instagram_business_account` requires at least `instagram_basic`; without it Graph often **omits** the field (HTTP 200), and the app treated that as “not linked”.

## Remediation (focused)

1. Add Instagram scopes to Facebook OAuth:
   - `instagram_basic`
   - `instagram_content_publish`
2. Keep `auth_type=rerequest` so reconnect re-prompts for missing permissions.
3. Safer discovery messaging:
   - Missing `instagram_business_account` → `ig_unavailable` (do not claim unlinked).
   - Graph permission errors → `permission` with reconnect + approve Instagram scopes guidance.
4. Token / Graph payload redaction unchanged (`logFacebookOAuthEvent`).

## Governance status (until staging smoke passes)

| Gate | Status |
| --- | --- |
| Facebook OAuth | **PASS** (prior MKT-001H) |
| Instagram discovery | **BLOCKED** until reconnect with new scopes on staging |
| MKT-001H overall | **CONDITIONAL PASS** |
| Production / `main` | **NO-GO** |

### Authoritative statement

> **MKT-001H.1: CONDITIONAL PASS pending staging reconnect + Instagram discovery/publish smoke. Production and `main` remain NO-GO.**

## Operator steps after staging deploy

1. Disconnect Facebook on Connected Accounts (staging).
2. Connect Facebook again and **approve Instagram permissions**.
3. Connect Instagram / retry discovery.
4. Controlled single-image publish smoke (if `MARKETING_PROVIDER_INSTAGRAM=1`).

**Caution:** Meta App Review may be required before non-role users can grant Instagram permissions. Staging admin / app-role users are normally sufficient while the Meta app is in development mode.

## Test / build evidence

Recorded on feature branch `feature/mkt-001h1-instagram-oauth-scopes` (2026-07-17):

| Gate | Result |
| --- | --- |
| OAuth tests (`metaFacebookOAuth.test.ts`) | **PASS** — scopes + `auth_type=rerequest` + log redaction |
| Instagram tests (`mkt001gInstagram.test.ts`) | **PASS** — discovery messaging + permission classification |
| Marketing regression (`lib/promotions` + `lib/oauth`) | **PASS** — 163/163 |
| Typecheck | **PASS** |
| Lint (changed files) | **PASS** — 0 errors |
| `next build --webpack` | **PASS** (routes include `/api/oauth/facebook` + callback) |
