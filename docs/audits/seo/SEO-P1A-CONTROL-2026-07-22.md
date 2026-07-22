# SEO-P1A — Provisional Control Record

| Field | Value |
|-------|-------|
| Document ID | `SEO-P1A-CONTROL-2026-07-22` |
| Date | 2026-07-22 |
| Amended | 2026-07-22 (SEO Engineering provisional Option B concurrence) |
| Program | Local SEO architecture / intent ownership / claim evidence (provisional) |
| Work class | **P1A — repo-only assessment + decision package** |
| Authorization | **Provisional baselining only** — no implementation |
| Status | **OPTION B — APPROVE WITH CONDITIONS (provisional, non-authoritative)** |
| Production authority | **NONE** |
| Formal governance | **BLOCKED** until Constitution, Department Interaction Matrix, and SEO Engineering mandate are verified current and approved |

---

## 1. Decision state (current)

| Field | Value |
|-------|-------|
| Documentary option | **B — Approve with conditions** |
| Authority level | **Provisional concurrence (SEO Engineering)** — not formal EO / governance approval |
| Baselining | Permitted for documentary inventory only |
| Implementation | **Forbidden** under this package |
| Freezes | Production, public content, redirects, metadata, schema, prices, Plesk, analytics, **GSC** — **IN FORCE** |

---

## 2. Required conditions (binding for provisional Option B)

| # | Condition | Baselining effect | Implementation |
|---|-----------|-------------------|----------------|
| 1 | Adopt `/locations/{suburb}-cleaning-services` as the **sole proposed location spine** | Recorded as proposed canon | No route changes |
| 2 | Correct documentation that still presents Stage 19 URLs as canonical | Docs amended in this package / companion doc PR | No edge/redirect changes |
| 3 | Replace stale city-intent mapping: `/` owns “cleaning services Cape Town”; `/services` owns service comparison/catalogue | Ownership decision recorded; code map update **deferred** to separately approved OWN scope | No `KEYWORD_PRIMARY_ROUTE` code ship in P1A |
| 4 | Freeze synthetic cleaner-network bands and “recent booking” vignettes from publication | Publication freeze recorded | Code removal / UI suppress = later scoped work |
| 5 | Reconcile R250 / R280 / service-band claims against transactional pricing source of truth | Claim gap recorded; reconciliation required before any price/schema ship | **No price edits** in P1A |
| 6 | Remove 410 Airbnb area editorials from **active** landing-page matrices | Matrices updated | No 410/redirect changes |
| 7 | Century City = **unresolved** until verified local evidence supports a hub; otherwise remove from proposed architecture | Marked unresolved / not proposed spine | No hub creation |
| 8 | Evidence-led winner selection required before consolidating any blog cluster | Policy recorded | No cluster merges |
| 9 | Split P1B into separately approved scopes; no combined bulk implementation | P1B family IDs listed; not opened | N/A |
| 10 | Maintain production, content, redirect, analytics, and GSC freezes | Reaffirmed | N/A |

---

## 3. Authorization scope

**Authorized under provisional Option B:**

* Documentary baselining of Matrices A–H (as amended)
* Documentation corrections that remove false Stage 19 canonicity claims
* Filing this control / decision package on a reviewable branch/PR

**Not authorized (frozen):**

* Public content edits
* Redirect map changes
* Metadata / title / description / robots changes
* Schema / structured-data production changes
* Price / pricing-band / “from” claim changes
* Production deployments
* Plesk / DNS / hosting changes
* Analytics configuration changes
* Google Search Console / Bing Webmaster write actions
* Synthetic-claim code removal (until separately scoped)
* Blog cluster consolidation
* Stage 19 re-enablement or route deletion
* Bulk P1B implementation

---

## 4. Formal governance blocker

Document-level **provisional** concurrence does **not** equal formal governance approval.

Formal approval remains blocked until these controlling instruments are verified **current and approved**:

1. Shalean AI Constitution (or successor)
2. Department Interaction Matrix
3. SEO Engineering mandate

Until then, treat Option B as **provisional and non-authoritative** for production or change execution.

---

## 5. Package contents

| # | Document | Path |
|---|----------|------|
| 1 | Control (this file) | `docs/audits/seo/SEO-P1A-CONTROL-2026-07-22.md` |
| 2 | Evidence matrices | `docs/audits/seo/SEO-P1A-EVIDENCE-MATRICES-2026-07-22.md` |
| 3 | Assessment | `docs/audits/seo/SEO-P1A-ASSESSMENT-2026-07-22.md` |
| 4 | Decision package | `docs/audits/seo/SEO-P1A-DECISION-PACKAGE-2026-07-22.md` |

Companion documentation corrections (same review PR when filed):

* `docs/stage-19-local-seo-domination.md` — Stage 19 not live-canonical
* `docs/master_seo_matrix.csv` — active vs retired / unresolved rows

---

## 6. Evidence classification

| Class | Meaning in this package |
|-------|-------------------------|
| **Repo fact** | Verified in repository source/data at assessment time |
| **Declared policy** | Written governance string / registry rule (may lack runtime enforcement) |
| **Runtime gap** | Declared in code but not wired / warn-only / redirected away |
| **Not verified** | Requires live DB, GSC, GBP, or production probe (out of P1A scope) |
| **Proposed canon (Option B)** | Binding for provisional baselining; not yet a production change order |

---

## 7. Approval block

| Field | Value |
|-------|-------|
| SEO Engineering (provisional) | **Option B — APPROVE WITH CONDITIONS** (non-authoritative) — 2026-07-22 |
| Formal EO / governance approver | _______________ |
| Formal decision | ☐ Confirm Option B ☐ Amend conditions ☐ Return ☐ Reject |
| Implementation authorized? | ☐ **No** (required) |
| Instruments verified current? | ☐ Constitution ☐ Interaction Matrix ☐ SEO mandate — all required |
| Effective date (formal) | _______________ |
| Signature / reference | _______________ |

**Default until formal sign-off: freeze remains in force; no implementation.**
