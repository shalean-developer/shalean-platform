# MKT-001H — Staging Verification

**Feature:** Facebook Connected Accounts OAuth  
**Branch:** `feature/mkt-001h-facebook-connected-accounts-oauth` (+ **MKT-001H.1** Instagram scope remediation)  
**Target environment:** staging only  
**Status:** CONDITIONAL PASS — Instagram discovery blocked until H.1 reconnect  
**Date opened:** 2026-07-17

> **Governance (MKT-001H.1):** Facebook OAuth **PASS**. Instagram discovery **BLOCKED** until staging deploy of Instagram OAuth scopes + admin disconnect/reconnect with Instagram permissions approved. Production / `main` **NO-GO**. See `MKT-001H.1-instagram-oauth-scope-remediation.md`.

---

## Prerequisites

- [ ] PR merged to `staging` (not `main`)
- [ ] Exact SHA deployed to staging
- [ ] Meta App configured with staging redirect URI
- [ ] `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` / `FACEBOOK_REDIRECT_URI` set on staging
- [ ] `MARKETING_PROVIDER_FACEBOOK=1`
- [ ] `FACEBOOK_ALLOW_ENV_TOKEN_FALLBACK=0` (unless testing fallback row)
- [ ] `MARKETING_OAUTH_ENCRYPTION_KEY` present
- [ ] Admin allowlisted operator available

---

## Verification matrix

| Scenario | Expected | Pass? | Evidence |
| --- | --- | --- | --- |
| Provider disabled (`MARKETING_PROVIDER_FACEBOOK=0`) | Connect unavailable; publish blocked | | |
| Disconnected account | **Connect Facebook** shown | | |
| OAuth cancel | Safe return; clear cancelled/denied toast | | |
| Invalid / replayed state | Request rejected (`invalid_state`) | | |
| Valid OAuth | Page discovery succeeds | | |
| Multiple Pages | Explicit selection required (`pick=1`) | | |
| Page selected | Token saved encrypted; card shows Page name + masked ID | | |
| Connected card | Correct Page + health (Connected / Healthy) | | |
| Text post | Publish succeeds | | |
| Image post | Publish succeeds | | |
| Duplicate click | One logical publish (idempotency) | | |
| Expired token | Reconnect guidance; publish blocked | | |
| Reconnect | Existing `social_accounts` row updated | | |
| Disconnect | Future publishing blocked; history retained | | |
| Token inspection | No plaintext token in browser / logs / DB views | | |
| Env fallback disabled | No silent fallback | | |
| Env fallback enabled (optional) | Audited `environment_fallback` source only | | |
| Facebook regression | Queue, ledger, retry, DLQ still work | | |
| Instagram regression | MKT-001G connect/publish after Facebook reconnect with Instagram scopes | | |
| Instagram discovery (MKT-001H.1) | `instagram_business_account` resolved after reconnect + approve IG permissions | | |

---

## Controlled publish smoke

Record:

| Item | Value |
| --- | --- |
| Staging deployment SHA | |
| Correlation ID | |
| Text post external ID | |
| Image post external ID | |
| Token source observed | `connected_account` / `environment_fallback` |

---

## Exit criteria checklist

- [ ] Facebook connectable from UI
- [ ] Admin can select the correct Page
- [ ] Page tokens encrypted + DB-backed
- [ ] Publishing uses Connected Accounts record
- [ ] Expired tokens trigger reconnect workflow
- [ ] Normal operation no longer requires Vercel token updates
- [ ] Disconnect controlled + auditable
- [ ] Env tokens fallback-only
- [ ] Focused + regression tests pass
- [ ] Exact-SHA staging verification passes
- [ ] Facebook controlled publish smoke passes

---

## Release decision (until this sheet is green)

- Facebook is **not** approved for normal production operation.
- Env-token flow may be used only for controlled staging smoke when fallback is explicitly enabled.
- Instagram I1–I9 remains conditional if it depends on the same Meta operator connection.
- GBP remains independently disabled / NO-GO.
- **No production release is authorized.**

---

## Notes / findings

_Fill during staging run._
