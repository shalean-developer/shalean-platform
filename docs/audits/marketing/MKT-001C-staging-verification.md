# MKT-001C — Staging Verification

**Program:** Marketing Platform Remediation  
**Phase:** MKT-001C — Provider Architecture (staging verification)  
**Mode:** Controlled staging verification — **production untouched**  
**Source implementation:** `docs/audits/marketing/MKT-001C-provider-architecture.md`  
**PR:** https://github.com/shalean-developer/shalean-platform/pull/43  
**Date:** 2026-07-17  

---

## 1. Executive decision

**PASS** for staging.

MKT-001C provider architecture is merged into `staging`, deployed at the exact merge SHA, and verified for deployment integrity, regression safety, and ledger non-regression. The phase is **complete through staging verification**.

**Production remains NO-GO.** `staging → main` stays blocked while MKT-001A-PROD is open.

---

## 2. Staging gate matrix

| Gate | Status |
|---|---|
| PR #43 approved + merged into `staging` | **PASS** |
| Exact staging SHA `375d2914` deployed | **PASS** |
| Staging deployment READY | **PASS** |
| Provider architecture regression suite | **PASS** (48/48) |
| Idempotency ledger intact on staging DB | **PASS** |
| Marketing office routes healthy on deploy | **PASS** (200) |
| Runtime error scan on merge deploy | **PASS** (no error/fatal) |
| `main` / production untouched | **PASS** |
| Admin-authenticated publish smoke (FB/GBP) | **OPERATOR** (Vercel SSO + admin session required) |

---

## 3. Deployment traceability

| Item | Value |
|---|---|
| Feature branch | `feature/mkt-001c-provider-architecture` |
| Merge commit (staging tip) | `375d291403c50960176385ce2872d4a03ecae9d3` |
| Feature commit | `bff69aee451475c2bc9021bd8f6d0cec1fffa763` |
| Vercel deployment | `dpl_2hHRFuHyrvbMSwdtAHotS21JFkBL` |
| Deployment SHA | `375d2914` (exact match) |
| Ready state | **READY** |
| Staging branch alias | `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app` |
| Deployment URL | `https://shalean-platform-4ql1oe4fj-shalean-cleaning-services.vercel.app` |
| Production / `main` | **Untouched** — `375d2914` is **not** an ancestor of `origin/main` (`ad5b4ccb`) |

---

## 4. Verification evidence

### 4.1 Merge + deploy

- PR #43 state: **MERGED** at `2026-07-17T08:39:31Z`
- Vercel `readyState`: **READY** for `dpl_2hHRFuHyrvbMSwdtAHotS21JFkBL`
- Meta `githubCommitRef`: `staging`
- Meta `githubCommitSha`: `375d291403c50960176385ce2872d4a03ecae9d3`

### 4.2 Regression tests (post-merge)

```text
npx vitest run lib/promotions/providers/__tests__ \
  lib/promotions/__tests__/publishProviderErrors.test.ts \
  lib/promotions/__tests__/publishIdempotency.test.ts \
  lib/promotions/__tests__/facebookPublish.test.ts \
  lib/promotions/__tests__/googleBusinessPublish.test.ts

Test Files  6 passed (6)
Tests       48 passed (48)
```

Covers: registry, feature flags, capabilities, unsupported provider, unified response mapping, error classification, fail-closed ledger, idempotent replay, FB/GBP adapter normalization, MKT-001B taxonomy compatibility.

### 4.3 Staging database (Supabase `gbgnemlpyykyhpqqbgru`)

| Check | Result |
|---|---|
| `marketing_publish_idempotency` present | **PASS** |
| Provider CHECK still `facebook \| google_business` | **PASS** |
| Status CHECK still `processing \| succeeded \| failed` | **PASS** |
| Ledger / history readable | **PASS** |

MKT-001C did not alter encryption, SSRF, or idempotency schema — confirmed by intact constraints.

### 4.4 Runtime health (exact deploy)

Runtime logs for `dpl_2hHRFuHyrvbMSwdtAHotS21JFkBL` show marketing office routes returning **200** on staging, including:

- `/office/marketing`
- `/office/marketing/campaigns`
- `/office/marketing/social`
- `/office/promotions`

No error/fatal logs observed on the merge deployment window.

### 4.5 Operator-gated publish smoke

Automated unauthenticated HTTP probes to `/api/health/environment` and publish diagnose routes are blocked by **Vercel Deployment Protection (SSO login wall)**. Admin publish verification (Facebook/GBP diagnose GET + publish via `runPublish` registry path, including idempotent replay) remains an **operator smoke** with an authorized staging admin session — same class of gate as MKT-001B admin flows.

Operator checklist (staging only):

1. Facebook diagnose GET returns configured/token diagnostics via registry-backed route.
2. GBP ready GET returns connection/location status via registry-backed route.
3. First publish succeeds with `correlationId`.
4. Duplicate publish returns `idempotentReplay` without a second external post.
5. Failure responses still include `classification`, `retryable`, `recoveryGuidance`.

---

## 5. CI notes (merge gate)

| Check | Result | Notes |
|---|---|---|
| validate-migration-filenames | PASS | |
| GitGuardian | PASS | |
| Vercel preview / staging deploy | PASS | Merge deploy READY |
| Live internal link crawl | RED (unrelated) | Pre-existing prod `/locations/*` 404s — same classification as PR #41 / #42; not caused by MKT-001C |

---

## 6. Current governance state

| Item | Status |
|---|---|
| **MKT-001C (staging)** | **Complete** — verification **PASS** |
| **MKT-001C production** | **NO-GO** |
| **MKT-001A-PROD** | Still **OPEN** — blocks `staging → main` |
| **MKT-001B** | Staging PASS; production NO-GO (unchanged) |
| **Next engineering (optional)** | MKT-001B.2 durable queue / DLQ, or scheduled publishing — both can call `SocialProvider.publish` |

---

## 7. Next release action

1. Keep waiting on external **Google Business Profile API approval** (MKT-001A-PROD).
2. No merge to `main` and no production deploy until MKT-001A-PROD is formally closed.
3. After MKT-001A-PROD **GO**, evaluate a combined `staging → main` release including MKT-001A + MKT-001B + MKT-001C.
4. Optionally complete the operator publish smoke checklist above and append evidence if desired (does not unblock production).

**Release rule (unchanged):** no production deploy and no merge to `main` until MKT-001A-PROD is formally closed.
