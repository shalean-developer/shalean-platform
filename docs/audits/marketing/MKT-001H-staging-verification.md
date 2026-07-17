# MKT-001H — Staging Verification

**Feature:** Facebook Connected Accounts OAuth  
**PR:** https://github.com/shalean-developer/shalean-platform/pull/57  
**Docs close-out PR:** https://github.com/shalean-developer/shalean-platform/pull/58  
**Base:** `staging`  
**Date:** 2026-07-17  

---

## Executive decision

| Gate | Status |
| --- | --- |
| Pre-merge gates | **PASS** (recorded on PR #57) |
| Merge to `staging` | **DONE** |
| Staging Meta env + Meta app allowlist | **PASS** (operator configuration checkpoint complete) |
| Post-config exact-SHA staging redeploy | **PASS** |
| Deployment health identity (post-config) | **PASS** |
| Operator OAuth / publish smoke matrix | **PENDING** (admin interactive session required) |
| Production authorization | **NO-GO** |

### Authoritative statement

> **MKT-001H: CONDITIONAL PASS — live staging OAuth and publishing smoke still pending. Production and `main` remain NO-GO.**

Configuration items are **PASS**. Live Connected Accounts OAuth + controlled publish smoke remain incomplete until an allowlisted admin completes the matrix and redacted evidence is attached.

---

## 1. Exact merge SHA

| Item | Value |
| --- | --- |
| PR | #57 |
| Merged at | `2026-07-17T17:09:02Z` |
| **Merge SHA** | `2af18dc307d745918cbf6cab3d7f6184204633ef` |
| Feature tip included | `eae16ee14eaaed4050eab6524d78106e625bf7cf` |

---

## 2. Post-config exact-SHA deployment (authoritative)

Env-var changes do not apply to already-running deployments. After the Meta configuration checkpoint, Preview redeploy of the exact merge SHA produced a **new** deployment. Do **not** cite the pre-config ID as evidence for the newly configured environment.

| Item | Value |
| --- | --- |
| **Deployment ID** | `dpl_BPebLMddKtAxcyGaY3bVcyWBjy4v` |
| Ready state | **READY** |
| Git branch | `staging` |
| Git SHA | `2af18dc307d745918cbf6cab3d7f6184204633ef` |
| Source | `redeploy` (original: `dpl_92Ph3z6DucAV8kEa6gDM5vM67Xwj`) |
| Target | Preview (not Production) |
| Branch alias | `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app` |
| Deployment URL | `https://shalean-platform-fhur97qfd-shalean-cleaning-services.vercel.app` |
| Inspector | https://vercel.com/shalean-cleaning-services/shalean-platform/BPebLMddKtAxcyGaY3bVcyWBjy4v |

### Historical pre-config deploy (superseded for env evidence)

| Item | Value |
| --- | --- |
| Deployment ID | `dpl_92Ph3z6DucAV8kEa6gDM5vM67Xwj` |
| Note | Pre-Meta-config; **not** valid evidence for post-config runtime |

---

## 3. Health / identity verification (post-config)

`GET /api/health/environment` on both the exact deployment host and the staging branch alias (share-authenticated browser fetch):

| Field | Observed |
| --- | --- |
| `status` | `ok` |
| `deployment` | `staging` |
| `gitBranch` | `staging` |
| `vercelEnv` | `preview` |
| `shaleanAppEnv` | `staging` |
| `issues` | `[]` |
| Exact-deploy timestamp | `2026-07-17T18:31:46.666Z` |
| Branch-alias timestamp | `2026-07-17T18:32:34.740Z` |

Redacted evidence: `docs/audits/marketing/evidence/mkt-001h-postconfig-redeploy-2026-07-17T1831Z.json`

---

## 4. Staging env configuration

Required Preview / staging vars (branch `staging`):

```text
FACEBOOK_APP_ID=<staging Meta app ID>
FACEBOOK_APP_SECRET=<staging Meta app secret>
FACEBOOK_REDIRECT_URI=https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app/api/oauth/facebook/callback
MARKETING_PROVIDER_FACEBOOK=1
FACEBOOK_ALLOW_ENV_TOKEN_FALLBACK=0
MARKETING_OAUTH_ENCRYPTION_KEY=<existing staging marketing OAuth encryption key>
```

| Control | Status |
| --- | --- |
| Exact callback URL documented | **YES** |
| Vars applied on Vercel Preview for `staging` | **PASS** (operator checkpoint complete) |
| Meta app Valid OAuth Redirect URIs includes exact callback | **PASS** (operator checkpoint complete) |
| `FACEBOOK_ALLOW_ENV_TOKEN_FALLBACK=0` | **PASS** (operator checkpoint) |
| Provider flag `MARKETING_PROVIDER_FACEBOOK=1` | **PASS** (operator checkpoint) |
| Fresh redeploy after env change | **PASS** (`dpl_BPebLMdd…`) |

Secrets / tokens are not recorded in this document.

---

## 5. Operator smoke matrix

Attempted after post-config READY deploy. Navigation reached staging admin sign-in (`/auth/login?redirect=/office/marketing/connected-accounts`). **Blocked:** no allowlisted admin credentials in this agent session; Meta OAuth also requires interactive operator login.

| Scenario | Expected | Result |
| --- | --- | --- |
| Provider disabled | Connect unavailable; publish blocked | PENDING |
| Disconnected account | **Connect Facebook** shown | PENDING |
| OAuth cancel | Safe return; clear message | PENDING |
| Invalid / replayed state | `invalid_state` rejection | PENDING |
| Valid OAuth | Page discovery succeeds | PENDING |
| Multiple Pages | Explicit selection required | PENDING |
| Page selected | Token encrypted in `social_accounts` | PENDING |
| Connected card | Correct Page + health | PENDING |
| Text post | Publish succeeds | PENDING |
| Image post | Publish succeeds | PENDING |
| Duplicate click | One logical publish | PENDING |
| Expired token | Reconnect guidance | PENDING |
| Reconnect | Existing row updated | PENDING |
| Disconnect | Future publish blocked; history retained | PENDING |
| Token inspection | No plaintext in browser/logs/DB views | PENDING |
| Env fallback disabled | No silent fallback | PENDING |
| Facebook queue / retry / DLQ | Regression PASS | PENDING |
| Instagram regression | MKT-001G behavior preserved | PENDING |

### Controlled publish smoke (blank until run)

| Item | Value |
| --- | --- |
| Staging deployment SHA | `2af18dc307d745918cbf6cab3d7f6184204633ef` |
| Post-config deployment ID | `dpl_BPebLMddKtAxcyGaY3bVcyWBjy4v` |
| Correlation ID | |
| Text post external ID | |
| Image post external ID | |
| Token source observed | |

Evidence rules: masked Page ID, connection status, publish/ledger IDs, correlation IDs only — **no** app secret, encryption key, access tokens, OAuth code, or raw Meta responses.

---

## 6. Completed this pass

1. Operator Meta configuration checkpoint accepted as **PASS**.  
2. Triggered Preview redeploy of exact SHA `2af18dc3…` (not Production).  
3. Recorded new deployment ID `dpl_BPebLMddKtAxcyGaY3bVcyWBjy4v` (**READY**).  
4. Verified health: `deployment=staging`, `gitBranch=staging`, `issues=[]`.  
5. Confirmed pre-config `dpl_92Ph3z6…` is superseded for env evidence.  
6. Confirmed production / `main` remain unauthorized.

---

## 7. Remaining to reach **PASS — staging complete**

1. Sign in as allowlisted staging admin.  
2. Run Office → Marketing → Connected Accounts → Connect Facebook through the full matrix (section 5).  
3. Attach redacted smoke evidence.  
4. Flip this document’s decision to **PASS — staging complete** only with that evidence.

---

## 8. Release posture

| Scope | Decision |
| --- | --- |
| Merge to `staging` | **Authorized / Done** |
| Staging Meta configuration | **PASS** |
| Post-config exact-SHA deploy + health | **PASS** |
| Staging OAuth + publish smoke | **Incomplete** |
| Merge to `main` | **Forbidden** |
| Facebook production readiness | **NO-GO** |
| Overall production release | **NO-GO** |

---

## Evidence index

| Artifact | Location / ID |
| --- | --- |
| Feature PR | https://github.com/shalean-developer/shalean-platform/pull/57 |
| Docs PR | https://github.com/shalean-developer/shalean-platform/pull/58 |
| Merge SHA | `2af18dc307d745918cbf6cab3d7f6184204633ef` |
| **Post-config deployment** | `dpl_BPebLMddKtAxcyGaY3bVcyWBjy4v` |
| Pre-config deployment (superseded) | `dpl_92Ph3z6DucAV8kEa6gDM5vM67Xwj` |
| Health probe (exact deploy) | `/api/health/environment` @ `2026-07-17T18:31:46.666Z` |
| Health probe (branch alias) | `/api/health/environment` @ `2026-07-17T18:32:34.740Z` |
| Redeploy evidence JSON | `docs/audits/marketing/evidence/mkt-001h-postconfig-redeploy-2026-07-17T1831Z.json` |
| Architecture audit | `docs/audits/marketing/MKT-001H-facebook-connected-accounts-oauth.md` |
