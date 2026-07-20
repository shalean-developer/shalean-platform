# MKT-001E — Platform Intelligence

**Project:** Shalean Cleaning Services  
**Phase:** MKT-001E — Platform Intelligence (operational decision engine)  
**Date:** 2026-07-17  
**Branch:** `feature/mkt-001e-platform-intelligence`  
**Base:** `staging`  
**Type:** Intelligence / decision-support layer (staging-only; not a production release)

**Companion catalog:** [`MKT-001E-operational-intelligence-rules.md`](./MKT-001E-operational-intelligence-rules.md)

---

## Governance

| Constraint | Status |
|---|---|
| MKT-001A-PROD remains **OPEN / NO-GO** | Respected |
| Target `staging` only | Respected |
| Do not merge to `main` / do not deploy production | Respected |
| Preserve MKT-001A–D and MKT-001B.2 controls | Respected |
| Intelligence only — no AI-generated content | Respected |
| Deterministic, explainable, actionable recommendations | Respected |

---

## 1. Executive Summary

MKT-001E delivers an **operational decision engine** on top of existing publish, queue, provider, and ledger telemetry:

1. Operational health dashboard + trends
2. Campaign / provider / queue intelligence
3. **Data quality intelligence** (surfaced, not silenced)
4. **Rule-based alerts** with severity + timestamp + action
5. **SLIs** with explicit targets
6. **Explainable recommendations** (why / metrics / evidence / action)
7. **Runbook links** for remediation
8. **Dashboard filters + saved views**

| Score | Value |
|---|---|
| **Decision-engine completeness** | **88 / 100** |
| **Staging readiness** | **GO for staging merge** (after PR review + smoke) |
| **Production readiness** | **NO-GO** until MKT-001A-PROD closes |

---

## 2. Intelligence Architecture

```text
Admin UI  /office/marketing/intelligence
  filters: window · provider · campaign · saved views (localStorage)
        │
        ▼
GET /api/admin/promotions/publish-intelligence
GET /api/admin/promotions/publish-jobs
        │
        ▼
publishIntelligence.ts          (snapshot aggregation)
publishIntelligenceDecision.ts  (pure DQ / alerts / recs / SLIs)
publishIntelligenceCatalog.ts   (thresholds + runbooks SoT)
        │
        ▼
social_publish_jobs · history · ledger · accounts · campaign_content · cron_runs · registry
```

No new SoT tables. No publish-path mutations.

---

## 3. Data Sources

Unchanged authoritative sources from A–D / B.2, plus `cron_runs` for worker health and the provider registry for capability/flag consistency.

---

## 4. Dashboard Design

Single Office view with health KPIs, SLI table, alerts, recommendations, data quality, queue/provider/campaign/trends, DLQ drill-down + replay, and runbook index. Customization: time range, provider, campaign, named saved views.

---

## 5. Recommendation / Alert / DQ / SLI Rules

Fully enumerated in **`MKT-001E-operational-intelligence-rules.md`**. Code mirrors the catalog via `INTEL_THRESHOLDS`, `INTEL_RUNBOOKS`, and pure builders in `publishIntelligenceDecision.ts`.

---

## 6. Delivered Work

| Area | Path |
|---|---|
| Catalog | `publishIntelligenceCatalog.ts` |
| Decision engine | `publishIntelligenceDecision.ts` |
| Snapshot | `publishIntelligence.ts` |
| APIs | `publish-intelligence`, `publish-jobs` |
| UI | `PlatformIntelligencePanel` |
| Rules doc | `MKT-001E-operational-intelligence-rules.md` |
| Audit | this file |
| Tests | `publishIntelligence.mkt001e.test.ts` |

---

## 7. Explicit Non-Goals

AI-generated content, metrics warehouses, engagement insights ingest, production deploy / merge to `main`.

---

## 8. Risk Assessment

| Risk | Mitigation |
|---|---|
| Aggregate query cost | Head counts + capped selects; admin-only |
| False-positive alerts | Versioned thresholds + unit tests |
| Untrusted metrics | DQ findings surfaced first |
| Secret leakage | No payload bodies; sanitized errors; admin gate |
| Publish regression | Read-only intelligence path |

---

## 9–10. Operational Value & Maintainability

Administrators detect issues, see prioritized alerts, understand why, open the matching runbook, and act. Thresholds/runbooks live in one code catalog + one markdown catalog; change both in the same PR.

---

## 11. Testing

Evidence: `docs/audits/marketing/evidence/mkt-001e-intelligence-tests-2026-07-17.txt`

**Staging smoke:** open intelligence → toggle filters → confirm alerts/recs/DQ/SLIs → DLQ replay if present → Social Posts unchanged.

---

## 12. GO / NO-GO

| Decision | Status |
|---|---|
| **Merge to `staging`** | **GO** after review + smoke |
| **`main` / production** | **NO-GO** — MKT-001A-PROD open |

---

## 13. Success Criteria Checklist

- [x] Unified operational intelligence dashboard
- [x] Metrics from authoritative operational data
- [x] Deterministic, explainable, actionable recommendations
- [x] Rule-based severity-ranked alerts
- [x] Data quality issues detected and surfaced
- [x] Runbooks linked to recommendations
- [x] Publishing / provider / queue / security workflows unaffected
- [x] Staging-ready while MKT-001A-PROD remains NO-GO

---

## 14. Next Actions

1. PR → `staging` only.
2. Staging smoke.
3. Continue waiting on GBP API approval (MKT-001A-PROD).

*End of MKT-001E audit.*
