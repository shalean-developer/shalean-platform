# MKT-001H — Staging Verification

**Feature:** Facebook Connected Accounts OAuth  
**PR:** https://github.com/shalean-developer/shalean-platform/pull/57  
**Base:** `staging`  
**Date:** 2026-07-17  

---

## Executive decision

| Gate | Status |
| --- | --- |
| Pre-merge gates | **PASS** (recorded on PR #57) |
| Merge to `staging` | **DONE** |
| Exact-SHA staging deploy | **PASS** |
| Deployment health identity | **PASS** |
| Meta OAuth env + Meta app allowlist | **OPERATOR PENDING** |
| Operator OAuth / publish smoke matrix | **OPERATOR PENDING** |
| Production authorization | **NO-GO** |

### Authoritative statement

> **CONDITIONAL PASS — named operator items remain.**  
> Code is merged and the exact merge SHA is live on staging with healthy identity.  
> Staging OAuth + controlled publish smoke are **not** complete until Meta app credentials, redirect allowlist, and the operator smoke matrix are executed and recorded.  
> **Production remains NO-GO.** Do not merge to `main`.

---

## 1. Exact merge SHA

| Item | Value |
| --- | --- |
| PR | #57 |
| Merged at | `2026-07-17T17:09:02Z` |
| **Merge SHA** | `2af18dc307d745918cbf6cab3d7f6184204633ef` |
| Feature tip included | `eae16ee14eaaed4050eab6524d78106e625bf7cf` |
| Local `staging` HEAD | `2af18dc307d745918cbf6cab3d7f6184204633ef` (matches `origin/staging`) |
| Working tree | Clean for MKT-001H (unrelated untracked `docs/governance/` only) |

CI note at merge: `web-test` / Live internal link crawl **RED** for pre-existing production `/locations/*` 404s (**OPS-CI-001** / issue #49). Same classification as prior MKT merges. Check was **not** weakened.

---

## 2. Exact-SHA deployment

| Item | Value |
| --- | --- |
| Deployment ID | `dpl_92Ph3z6DucAV8kEa6gDM5vM67Xwj` |
| Ready state | **READY** |
| Git branch | `staging` |
| Git SHA | `2af18dc307d745918cbf6cab3d7f6184204633ef` |
| Branch alias | `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app` |
| Deployment URL | `https://shalean-platform-jocja0yn0-shalean-cleaning-services.vercel.app` |
| Inspector | https://vercel.com/shalean-cleaning-services/shalean-platform/92Ph3z6DucAV8kEa6gDM5vM67Xwj |

---

## 3. Health / identity verification

Fetched via Vercel-authenticated fetch of branch-alias health:

`GET /api/health/environment`

| Field | Observed |
| --- | --- |
| `status` | `ok` |
| `deployment` | `staging` |
| `gitBranch` | `staging` |
| `vercelEnv` | `preview` |
| `shaleanAppEnv` | `staging` |
| `issues` | `[]` |
| Timestamp | `2026-07-17T17:16:36.670Z` |

---

## 4. Staging env configuration (operator)

Required Preview / staging vars (branch `staging`):

```text
FACEBOOK_APP_ID=<staging Meta app ID>
FACEBOOK_APP_SECRET=<staging Meta app secret>
FACEBOOK_REDIRECT_URI=https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app/api/oauth/facebook/callback
MARKETING_PROVIDER_FACEBOOK=1
FACEBOOK_ALLOW_ENV_TOKEN_FALLBACK=0
MARKETING_OAUTH_ENCRYPTION_KEY=<existing staging marketing OAuth encryption key>
```

Also confirm `NEXT_PUBLIC_SITE_URL` (if used for redirect derivation) matches the staging host used in Meta allowlisting.

| Control | Status |
| --- | --- |
| Exact callback URL documented | **YES** (above) |
| Vars applied on Vercel Preview for `staging` | **OPERATOR PENDING** — this agent session cannot write team `shalean-cleaning-services` env (CLI scoped to personal projects only; MCP has deploy/read, not env mutate) |
| Meta app Valid OAuth Redirect URIs includes exact callback | **OPERATOR PENDING** |
| `FACEBOOK_ALLOW_ENV_TOKEN_FALLBACK=0` confirmed | **OPERATOR PENDING** |
| Provider flag `MARKETING_PROVIDER_FACEBOOK=1` confirmed | **OPERATOR PENDING** |

---

## 5. Operator smoke matrix (pending)

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

---

## 6. What this close-out completed without operator Meta secrets

1. Merged PR #57 → `staging`.  
2. Recorded exact merge SHA `2af18dc3…`.  
3. Confirmed local/remote `staging` contains the merge.  
4. Observed auto-deploy of exact SHA to **READY**.  
5. Verified staging health identity (`deployment=staging`, `gitBranch=staging`, `issues=[]`).  
6. Documented exact callback URI for Meta allowlisting.  
7. Confirmed production remains unauthorized.

---

## 7. Named operator items to reach **PASS — staging complete**

1. Set the six env controls on Vercel Preview for staging (section 4).  
2. Allowlist the exact `FACEBOOK_REDIRECT_URI` in the Meta app.  
3. Redeploy / wait for env to attach to the exact SHA if vars were added after build.  
4. As an allowlisted admin, run the full smoke matrix (section 5).  
5. Attach evidence (correlation IDs, masked Page ID, publish history IDs — **no tokens**).  
6. Flip this document’s decision to **PASS — staging complete** only with that evidence.

---

## 8. Release posture

| Scope | Decision |
| --- | --- |
| Merge to `staging` | **Authorized / Done** |
| Staging OAuth + publish verification | **Incomplete** |
| Merge to `main` | **Forbidden** |
| Facebook production readiness | **NO-GO** |
| Overall production release | **NO-GO** |

---

## Evidence index

| Artifact | Location / ID |
| --- | --- |
| PR | https://github.com/shalean-developer/shalean-platform/pull/57 |
| Merge SHA | `2af18dc307d745918cbf6cab3d7f6184204633ef` |
| Deployment | `dpl_92Ph3z6DucAV8kEa6gDM5vM67Xwj` |
| Health probe | branch-alias `/api/health/environment` @ `2026-07-17T17:16:36.670Z` |
| Architecture audit | `docs/audits/marketing/MKT-001H-facebook-connected-accounts-oauth.md` |
