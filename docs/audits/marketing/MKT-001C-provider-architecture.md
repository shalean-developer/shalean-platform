# MKT-001C — Provider Architecture

**Project:** Shalean Cleaning Services  
**Phase:** MKT-001C — Provider Architecture  
**Date:** 2026-07-17  
**Branch:** `feature/mkt-001c-provider-architecture`  
**Base:** `staging`  
**Type:** Architecture refactor (no production release)

---

## Governance

| Constraint | Status |
|---|---|
| MKT-001A-PROD remains **OPEN / NO-GO** (Google Business Profile API external approval) | Respected — not modified |
| MKT-001B staging verification remains PASS; unreleased to production | Respected |
| Do not merge to `main` | Respected |
| Do not deploy to production | Respected |
| Do not change encryption implementation | Respected |
| Do not weaken idempotency | Respected |
| Do not remove correlation IDs / observability | Respected |
| May merge to `staging` after review | Intended path |

**Release rule:** MKT-001C may land on staging only. Production remains gated by MKT-001A-PROD.

---

## 1. Executive Summary

MKT-001C replaces provider-specific publish route duplication with a **provider-agnostic architecture**:

- `SocialProvider` interface (connect, disconnect, refresh, validate, publish, capabilities, error classification, response normalization)
- `ProviderRegistry` for discovery, lookup, feature flags, and versioning
- Unified domain models (`PublishRequest`, `PublishResult`, `ProviderCapabilities`, `ConnectionStatus`, `PublishState`)
- Shared `runPublish()` publishing service that owns MKT-001A/B controls (claim → call → ledger → history → logs)

Facebook Page and Google Business Profile were migrated behind adapters. Instagram / LinkedIn / Pinterest / X are registered as **feature-flagged stubs** (disabled by default).

| Score | Value |
|---|---|
| **Architecture Score** | **82 / 100** |
| **Maintainability Score** | **80 / 100** |
| **Staging merge readiness** | **GO** |
| **Production readiness** | **NO-GO** (external MKT-001A-PROD blocker unchanged) |

---

## 2. Current Architecture (pre-MKT-001C)

```text
CampaignMarketingHub
        │
        ├─ POST /publish-facebook  ──► facebookPublish.ts (direct)
        │                              + duplicated claim/observe/history
        │
        └─ POST /publish-google-business ──► google-business.ts (direct)
                                               + duplicated claim/observe/history
```

Pain: adding a provider required copying ~200 lines of orchestration and branching in routes.

---

## 3. Proposed / Implemented Architecture

```text
Publish Request
        │
        ▼
Publishing Service (runPublish)
  • correlation ID
  • fail-closed idempotency claim
  • observability phases
  • history + ledger mark
        │
        ▼
Provider Registry
        │
 ┌──────┼──────────────┬──────────────┐
 ▼      ▼              ▼              ▼
GBP   Facebook     Instagram*     LinkedIn*
Provider Provider    (stub)         (stub)
        │
        ▼
Unified PublishResult
```

\* Stubs: registered for discovery; `MARKETING_PROVIDER_<KEY>=1` required to enable.

Core publishing depends only on `SocialProvider` + registry. Provider-specific Graph / Local Posts payloads stay inside adapters.

---

## 4. Class / Module Diagram

```text
apps/web/lib/promotions/providers/
├── types.ts                 SocialProvider + domain models
├── registry.ts              ProviderRegistry, feature flags
├── bootstrap.ts             Default registrations
├── publishingService.ts     runPublish / publishOutcomeToHttp
├── facebookProvider.ts      Adapter → facebookPublish.ts
├── googleBusinessProvider.ts Adapter → google-business.ts
├── stubProvider.ts          Future platforms
└── index.ts                 Public exports + bootstrap

apps/web/app/api/admin/promotions/
├── publish-facebook/route.ts           Thin: auth → runPublish
└── publish-google-business/route.ts    Thin: auth → runPublish
```

**Preserved (unchanged contracts):**

- `publishIdempotency.ts` — claim / succeed / fail / stuck reclaim
- `publishProviderErrors.ts` — failure taxonomy + recovery guidance
- `publishObservability.ts` — correlation + fingerprint + phases
- `tokenEncryption.ts` / `safeRemoteMedia.ts` — security controls

---

## 5. Provider Lifecycle

1. **Register** — `bootstrapProviderRegistry()` registers adapters at process start.
2. **Feature flag** — `MARKETING_PROVIDER_<KEY>` (default: FB + GBP on; stubs off).
3. **Resolve** — `registry.requireEnabled(key)`.
4. **Validate content** — `provider.validateContent(request)`.
5. **Claim** — `claimPublish` (fail-closed if ledger down) — **before** provider I/O / GBP media upload.
6. **Publish** — `provider.publish(request)`.
7. **Classify** — on failure, `provider.classifyError` → structured API body.
8. **Ledger + history** — succeed/fail mark + `social_publish_history`.
9. **After-success hooks** — promotion audit / GBP `campaign_content` status.

---

## 6. Unified Domain Models

| Model | Purpose |
|---|---|
| `PublishRequest` | Message, media, link, promotion metadata |
| `PublishResult` | Discriminated ok / error with `externalPostId` |
| `ProviderCapabilities` | Images, video, links, scheduling, limits, flags |
| `ConnectionStatus` | Health, configured, targetRef, hints |
| `PublishState` | pending / processing / succeeded / failed / replay / rejected |
| `ProviderKey` | facebook \| google_business \| instagram \| linkedin \| pinterest \| x |

Error classification remains compatible with MKT-001B:

`auth | permission | not_found | conflict | validation | rate_limit | provider_unavailable | timeout | network | unknown`

with `retryable`, `retryAfterMs`, and `recoveryGuidance`.

---

## 7. Extensibility Assessment

Adding a new provider requires:

1. Implement `SocialProvider`.
2. `registry.register(...)` in bootstrap (or feature module).
3. Write adapter + registry/service tests.
4. If the provider must use the idempotency ledger: extend `PublishProvider` + DB CHECK (migration) — **engine orchestration does not change**.

No route-level provider `if/else` for publish orchestration.

**Score: Extensibility 85 / 100** (ledger/provider enum still needs a migration for new publishable keys).

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Behavioral drift vs pre-refactor routes | Thin routes preserve response shapes (`postId` / `postName` / `correlationId`) |
| Circular imports registry ↔ bootstrap | Bootstrap sets registry; index bootstraps on import |
| Stub accidentally enabled in prod | Defaults off; explicit env flag required |
| GBP media orphan / duplicate | Claim still before `ensurePublicImageUrlForGooglePost` (inside adapter, after claim) |
| Weakening security/reliability | Encryption, SSRF, idempotency, observability modules untouched |

---

## 9. Testing

Targeted Vitest (2026-07-17):

| Suite | Result |
|---|---|
| `providers/__tests__/registry.test.ts` | PASS (13) |
| `providers/__tests__/publishingService.test.ts` | PASS (5) |
| `publishProviderErrors.test.ts` | PASS (6) |
| `publishIdempotency.test.ts` | PASS (13) |
| `facebookPublish.test.ts` | PASS (4) |
| `googleBusinessPublish.test.ts` | PASS (7) |
| **Total** | **48 / 48 PASS** |

Coverage includes: registration, selection, unsupported provider, feature flags, capabilities, error classification, response normalization, fail-closed ledger, idempotent replay, success/failure ledger marks.

Evidence: `docs/audits/marketing/evidence/mkt-001c-provider-architecture-tests-2026-07-17.txt`

---

## 10. Architecture & Maintainability Scores

| Dimension | Score | Notes |
|---|---|---|
| Separation of concerns | 85 | Engine vs adapters clear |
| Open/closed for new providers | 85 | Interface + register; ledger enum still closed |
| Backward compatibility | 80 | API JSON shapes preserved |
| Security non-regression | 90 | Encryption/SSRF untouched |
| Reliability non-regression | 88 | Claim-before-publish + fail-closed preserved |
| Testability | 82 | Registry injectable; service unit-tested |
| **Architecture (overall)** | **82** | |
| **Maintainability (overall)** | **80** | |

---

## 11. GO / NO-GO Decision

| Gate | Decision |
|---|---|
| Merge to `staging` after PR review | **GO** |
| Merge to `main` | **NO-GO** |
| Deploy production | **NO-GO** |
| Depends on MKT-001A-PROD (GBP API approval) | Still **OPEN** |

**Verdict:** MKT-001C is **GO for staging-only merge**. Production release remains blocked by external Google Business Profile API approval under MKT-001A-PROD. MKT-001B reliability controls are preserved.

---

## 12. Follow-ons (not in this phase)

1. **MKT-001B.2** — Durable publishing queue & dead-letter (worker calls same `SocialProvider.publish`)
2. Scheduled publishing engine (capability already modeled; implementation deferred)
3. Real Instagram / LinkedIn / X adapters behind feature flags
4. Expand ledger `PublishProvider` CHECK when first new publishable provider ships
