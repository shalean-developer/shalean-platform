# MKT-001D — Staging Verification

**Program:** Marketing Platform Remediation  
**Phase:** MKT-001D — Marketing Platform Completion & Operational Readiness (staging verification)  
**Mode:** Controlled staging verification — **production untouched**  
**Source:** `docs/audits/marketing/MKT-001D-marketing-platform-completion.md`  
**PR:** https://github.com/shalean-developer/shalean-platform/pull/45  
**Date:** 2026-07-17  

---

## 1. Executive decision

**PASS** for staging.

MKT-001D is merged into `staging`, deployed at the exact merge SHA, and verified for deployment integrity, regression safety, review checklist, and ledger non-regression. The phase is **complete through staging verification**.

**Production remains NO-GO.** `staging → main` stays blocked while MKT-001A-PROD is open.

---

## 2. Staging gate matrix

| Gate | Status |
|---|---|
| PR #45 review checklist (code) | **PASS** |
| PR #45 merged into `staging` | **PASS** |
| Exact staging SHA `2e293547` deployed | **PASS** |
| Staging deployment READY | **PASS** |
| Targeted regression suite | **PASS** (43/43) |
| Idempotency ledger intact on staging DB | **PASS** |
| Runtime error scan on merge deploy | **PASS** (no error/fatal) |
| `main` / production untouched | **PASS** |
| Admin-authenticated publish UX smoke | **OPERATOR** (Vercel SSO + admin session) |

---

## 3. Deployment traceability

| Item | Value |
|---|---|
| Feature branch | `feature/mkt-001d-marketing-completion` |
| Merge commit (staging tip) | `2e293547fc5dbcf5086a0fe004935d99203b16d8` |
| Feature commit | `c1762f4acbd9a23eb12e3898e072f59892e9fa76` |
| Vercel deployment | `dpl_XHV7YTHtV4kBcsYsNTe51p8USAQH` |
| Deployment SHA | `2e293547` (exact match) |
| Ready state | **READY** |
| Staging branch alias | `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app` |
| Deployment URL | `https://shalean-platform-4bg4nrymk-shalean-cleaning-services.vercel.app` |
| Production / `main` | **Untouched** — `2e293547` is **not** an ancestor of `origin/main` (`ad5b4ccb`) |

---

## 4. Review checklist (pre-merge)

| Check | Result |
|---|---|
| Provider registry is SSOT for availability | **PASS** — Connected Accounts built from `listEntries()` |
| Disabled providers cannot publish via API | **PASS** — `requireEnabled` + stub `501` in `runPublish` |
| Client limits supplement server validation | **PASS** — `validateContent` still enforced in adapters |
| Correlation IDs correspond to server records | **PASS** — created in `runPublish`, returned in API body |
| Recovery guidance hygiene | **PASS** — operator copy only; no tokens/secrets |
| `/api/admin/promotions/providers` admin metadata only | **PASS** — `requireAdminApi`; no secrets |
| Publish APIs backward compatible | **PASS** — `postId` / `postName` / `correlationId` preserved |

---

## 5. Verification evidence

### 5.1 Tests (post-merge)

```text
npx vitest run lib/promotions/__tests__/mkt001dCompletion.test.ts \
  lib/promotions/providers/__tests__ \
  lib/promotions/__tests__/publishProviderErrors.test.ts \
  lib/promotions/__tests__/publishIdempotency.test.ts

Test Files  5 passed (5)
Tests       43 passed (43)
```

### 5.2 Staging database (`gbgnemlpyykyhpqqbgru`)

| Check | Result |
|---|---|
| `marketing_publish_idempotency` present | **PASS** |
| Ledger readable | **PASS** (0 rows at verification time) |

### 5.3 Runtime

No error/fatal logs on `dpl_XHV7YTHtV4kBcsYsNTe51p8USAQH` in the deploy window.

### 5.4 Operator-gated matrix (admin session)

Automated unauthenticated HTTP is blocked by Vercel Deployment Protection. Complete with staging admin session:

| Scenario | Expected |
|---|---|
| Publish success | Success toast + history entry |
| Publish failure | Recovery guidance + correlation ID |
| Disabled provider | No publish action; copy/download only |
| Caption validation | Client limits before submit |
| Server validation | Invalid content still rejected |
| History filters | Filter + expand work |
| Failed last 24h strip | Accurate when failures exist |
| Connected Accounts | Registry-aligned cards |
| Secret hygiene | No credentials in UI/toasts |

---

## 6. CI notes

| Check | Result | Notes |
|---|---|---|
| validate-migration-filenames | PASS | |
| GitGuardian | PASS | |
| Vercel staging deploy | PASS | Merge deploy READY |
| Live internal link crawl | RED (unrelated) | Pre-existing prod `/locations/*` 404s — same as PR #41–#43 |

---

## 7. Current governance state

| Item | Status |
|---|---|
| **MKT-001D (staging)** | **Complete** — verification **PASS** |
| **MKT-001D production** | **NO-GO** |
| **MKT-001A-PROD** | Still **OPEN** — blocks `staging → main` |
| **MKT-001A / B / C** | Staging PASS (unchanged) |
| **Next engineering (optional)** | MKT-001B.2 durable queue / DLQ |

**Release rule (unchanged):** no production deploy and no merge to `main` until MKT-001A-PROD is formally closed.
