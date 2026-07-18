# MKT-001H.6.1 — Live E2E Meta Business Extension Failure Audit

**Date:** 2026-07-18  
**Target:** `staging` only  
**Production / `main`:** **NO-GO**

---

## Exact root cause (best evidence)

Staging Connect uses **User access token** Login for Business configs (`…1207` / `…4849`) but the authorize URL was built with the **System User** parameter shape:

- `config_id` ✅
- `response_type=code` ✅ (needed for server exchange)
- `override_default_response_type=true` ❌ **System User–only per Meta docs**

Meta docs:

| Config token type | Documented invoke shape |
| --- | --- |
| **User** access token | `config_id` only (manual flow may add `response_type=code`) |
| **System User** | `config_id` + `response_type=code` + `override_default_response_type=true` |

**First failing point:** Meta Business Extension asset-grant finalization on `facebook.com/facebook_business_extension/oauth/` after an intermediate Meta `code` — **before** Shalean callback. This matches forcing the SUAT/code-override path onto a User config.

Secondary (still true): earlier callbacks returned `access_denied` + `error_code=200` + “Permissions error” (pre-Live and mismatched grant). App Live alone did not fix the BE strand.

Graph API Explorer PASS is a **different** auth path (not Login for Business / not BE) and does not prove Connect.

---

## Evidence

### Vercel (post-Live attempt)

| Field | Value |
| --- | --- |
| Time | 06:17:51Z |
| Correlation | `fb-oauth-79900062-c7c7-4010-b474-46112c0e3336` |
| Deploy | `dpl_2ucp7T3CWdnjLGSNUrAKoHLKSGkp` @ `02c805a2` |
| `loginPurpose` | `facebook` |
| App / config | `…5561` / General **`…1207`** |
| Authorize | `hasConfigId=true`, `hasScope=false`, `authType=null`, **`hasOverrideDefaultResponseType=true`** |
| Callback for this CID | **none** |

### Prior Shalean callback (still on staging)

| Field | Value |
| --- | --- |
| Time | 05:45:02Z |
| `error` | `access_denied` |
| `error_code` | `200` |
| Description length | 17 (“Permissions error”) |
| `hasStateCookie` | false |

### Meta dashboard inspection (this session)

**Blocked:** Cursor browser reached Meta login wall (`business.facebook.com/business/loginpage`). No session available to list live General config assets/permissions/roles without operator login.

Operator must still confirm on **Shalean Social Publishing** (`…5561`):

1. General config `…1207`: Active, **User** access token, Page asset assigned, Page permissions grantable.
2. Instagram Graph config `…4849`: Active, **User** access token, IG Professional + Page assets.
3. App Review: `public_profile` **Advanced Access** (Meta FAQ requirement for Live LfB), plus Page/IG permissions access level.
4. Personal profile: full control of Page + app (not only Ads access).

### Graph Explorer vs staging OAuth

| Dimension | Graph Explorer | Staging Connect |
| --- | --- | --- |
| App | `…5561` (operator-attested) | `…5561` (runtime) |
| Auth path | Explorer token tool | Login for Business `dialog/oauth` + BE |
| `config_id` | N/A | `…1207` / `…4849` |
| Asset grant UI | None | Business Extension |
| `/me/accounts` | PASS | Never reached (no code) |

---

## Setting or code change made

**Code (staging PR only):** omit `override_default_response_type` unless `FACEBOOK_LOGIN_TOKEN_TYPE=system_user`.

Default remains **User** (matches operator configs). Optional env escape hatch for true SUAT configs.

Also retained from H.6: fail-closed missing config_id, no IG→FB config fallback, cookies on redirect response.

**Not changed:** production, main, secrets, Meta app recreation, permissions broadening, DB rows.

---

## Staging deployment

Pre-fix baseline: `dpl_2ucp7T3CWdnjLGSNUrAKoHLKSGkp` @ `02c805a2`.

Post-merge: record new deployment ID/SHA after PR lands on `staging`.

---

## Retest results

| Gate | Result |
| --- | --- |
| Reproduce once in Cursor | **Blocked** (Meta login + admin staging session required) |
| Facebook Connect after fix | **Pending operator** — expect `oauth_started` with `hasOverrideDefaultResponseType=false`, `loginTokenType=user` |
| Instagram discovery | **Pending** — blocked until Facebook save yields fresh Page token (current token Graph **190**) |

---

## Final governance

| Decision | Status |
| --- | --- |
| Facebook Connect | **NO-GO** until post-deploy operator retest |
| Instagram Connect | **NO-GO** |
| Production / `main` | **NO-GO** |
| Code fix authorization (staging) | **CONDITIONAL PASS** — documented User vs SUAT authorize mismatch |
| Meta support escalation | **If** post-fix retest still strands on BE with User shape + confirmed User config + Advanced Access `public_profile` + Page assigned — then escalate to Meta as platform BE defect |

**Overall: CONDITIONAL PASS** (root cause class identified + smallest authorize-shape fix). Connection PASS not claimed.
