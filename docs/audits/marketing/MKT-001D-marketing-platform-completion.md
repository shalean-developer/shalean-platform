# MKT-001D — Marketing Platform Completion & Operational Readiness

**Project:** Shalean Cleaning Services  
**Phase:** MKT-001D — Marketing Platform Completion & Operational Readiness  
**Date:** 2026-07-17  
**Branch:** `feature/mkt-001d-marketing-completion`  
**Base:** `staging`  
**Type:** Feature completeness + admin UX / ops readiness (not a production release)

---

## Governance

| Constraint | Status |
|---|---|
| MKT-001A-PROD remains **OPEN / NO-GO** (Google Business Profile API external approval) | Respected |
| Do not merge to `main` | Respected |
| Do not deploy to production | Respected |
| Preserve MKT-001A security (encryption, SSRF, ledger) | Respected |
| Preserve MKT-001B reliability (fail-closed, taxonomy, reclaim, observability) | Respected |
| Preserve MKT-001C provider architecture (`SocialProvider` + registry + `runPublish`) | Respected |
| May merge to `staging` after review | Intended path |

**Naming note:** This phase completes the **marketing platform itself**. Production release remains governed separately by MKT-001A-PROD. After that gate closes, evaluate a combined `staging → main` release of MKT-001A through MKT-001D.

---

## 1. Executive Summary

MKT-001D closes the operator-facing gap on top of A–C:

1. Publish failure taxonomy + correlation IDs surfaced in Social Posts toasts.
2. Connected Accounts rebuilt from the provider registry (stubs no longer claim “available” publish).
3. Capability / feature-flag snapshot API for graceful degradation.
4. Content status badges + editable captions + client-side limit validation.
5. Publishing history filters, expandable errors, failed-last-24h ops strip.
6. Accessibility polish (aria labels, status announcements, table caption).
7. Operator documentation updated (`CAMPAIGN_SOCIAL_PUBLISHING.md`).

| Score | Value |
|---|---|
| **Platform Completeness (FB+GBP ops)** | **84 / 100** |
| **Operational Readiness (staging)** | **GO for staging merge** |
| **Production readiness** | **NO-GO** until MKT-001A-PROD closes |

---

## 2. Current Architecture (post MKT-001C)

```text
Admin UI (Social Posts / Connected Accounts)
        │
        ▼
Thin routes → runPublish → Provider Registry
        │
        ├─ Facebook Provider (live)
        ├─ Google Business Provider (live)
        └─ IG / LinkedIn / Pinterest / X stubs (flags off)
```

MKT-001D does **not** change this orchestration. It aligns UI/ops with the registry and improves operator feedback.

---

## 3. Delivered Work

| Area | Change |
|---|---|
| Social Posts | Recovery/correlation toasts; caption edit; char/image precheck; content status badge; honest channel copy |
| Connected Accounts | Registry-driven cards; flag/capability chips; history filters; failed-24h strip; a11y |
| API | `GET /api/admin/promotions/providers`; social-accounts registry alignment + `ops.failedLast24h` |
| Client helpers | `providerLimits.ts`, `publishFailureUi.ts` |
| Docs | This audit + `CAMPAIGN_SOCIAL_PUBLISHING.md` provider/flag section |

---

## 4. Explicit Non-Goals (deferred)

- Real Instagram / LinkedIn / Pinterest / X adapters + credentials
- Durable publish queue / DLQ (MKT-001B.2)
- Scheduled publishing
- Provider insights analytics ingest
- Facebook OAuth (env Page token remains intentional)
- Multi-account schema (`UNIQUE(provider)` remains)
- `staging → main` or production deploy

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| UI overclaims multi-channel publish | Stub cards + Social Posts copy updated |
| Client limits drift from adapters | Constants documented as mirrors of provider caps |
| Operator enables stub flags expecting publish | Docs + `publishEnabled: false` for stubs |
| Weakening A/B/C | No encryption/idempotency/observability edits |

---

## 6. Testing

Targeted Vitest includes MKT-001D helpers + existing A/B/C suites.

Evidence: `docs/audits/marketing/evidence/mkt-001d-completion-tests-2026-07-17.txt`

---

## 7. Production-Readiness Assessment

| Dimension | Staging | Production |
|---|---|---|
| Security (MKT-001A) | PASS (unchanged) | Blocked by MKT-001A-PROD |
| Reliability (MKT-001B) | PASS (unchanged) | Blocked by MKT-001A-PROD |
| Provider architecture (MKT-001C) | PASS (unchanged) | Blocked by MKT-001A-PROD |
| Admin UX / ops completion (MKT-001D) | **PASS** | N/A until prod gate |
| External GBP API approval | N/A | **OPEN** |

**Verdict:** **GO for staging merge.** **NO-GO for production** until MKT-001A-PROD is closed.

---

## 8. Next Actions

1. Merge this PR to `staging` after review; run staging smoke (Connected Accounts cards + failure toast fields).
2. Continue waiting on Google Business Profile API approval (MKT-001A-PROD).
3. Optional next engineering: **MKT-001B.2** durable queue (calls same `SocialProvider.publish`).
4. After MKT-001A-PROD **GO**, evaluate combined `staging → main` release (A–D).
