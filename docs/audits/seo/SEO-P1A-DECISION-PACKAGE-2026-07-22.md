# SEO-P1A — Decision Package (Approval Gate)

| Field | Value |
|-------|-------|
| Document ID | `SEO-P1A-DECISION-PACKAGE-2026-07-22` |
| Date | 2026-07-22 |
| Amended | 2026-07-22 — SEO Engineering provisional Option B |
| Program | Local SEO architecture, blog clusters, intent ownership, local evidence & public claims |
| Work completed | Provisional **repo-only** assessment + evidence matrices + Option B condition amendments |
| Status | **OPTION B — APPROVE WITH CONDITIONS (provisional, non-authoritative)** |
| Control | `docs/audits/seo/SEO-P1A-CONTROL-2026-07-22.md` |
| Evidence matrices | `docs/audits/seo/SEO-P1A-EVIDENCE-MATRICES-2026-07-22.md` |
| Assessment | `docs/audits/seo/SEO-P1A-ASSESSMENT-2026-07-22.md` |

---

## 1. Executive summary

P1A inventoried (repo-only) location architectures, overlapping blog clusters, search-intent ownership, local evidence, and public claims.

**SEO Engineering provisional concurrence:** **Option B — approve with conditions for baselining only.**  
All implementation and GSC freezes remain in force.

This package was previously untracked on `main` (404 on default branch). It is filed on a reviewable branch/PR for **document-level** review. Formal governance approval remains **blocked** until the Constitution, Department Interaction Matrix, and SEO Engineering mandate are verified current and approved.

---

## 2. Current posture

| Item | Status under provisional Option B |
|------|-----------------------------------|
| Proposed location spine | **`/locations/{suburb}-cleaning-services` only** (23 existing hubs) |
| Stage 19 `/{intent}/{suburb}` | **Not canonical** — legacy/redirected; docs corrected |
| City intent “cleaning services Cape Town” | **Proposed owner: `/`** |
| Service comparison/catalogue intent | **Proposed owner: `/services`** |
| Stale `/cleaning-services-cape-town` keyword ownership | **Superseded** (documentary); code map update deferred |
| Synthetic cleaner bands / recent-booking vignettes | **Frozen from publication** (policy); code suppress deferred |
| Price floors R250 / R280 / bands | **Must reconcile** to transactional pricing SoT before any ship |
| 410 Airbnb area editorials | **Removed from active landing matrices** |
| Century City | **Unresolved** — not part of proposed spine until hub evidence |
| Blog cluster consolidation | **Evidence-led winner only**; no bulk merge |
| P1B | **Split scopes only**; no combined bulk implementation |
| Freezes | Production, content, redirect, analytics, GSC — **IN FORCE** |
| Implementation | **Not authorized** |

---

## 3. Required conditions (1–10)

See Control §2 for the binding table. Summary:

1. Hubs-only proposed location spine  
2. Correct Stage 19 canonicity in documentation  
3. City intent → `/`; catalogue intent → `/services`  
4. Freeze synthetic network bands and recent-booking vignettes from publication  
5. Reconcile price claims to transactional SoT (no P1A price edits)  
6. Drop 410 Airbnb area URLs from active landing matrices  
7. Century City unresolved / out of proposed architecture without hub evidence  
8. Evidence-led blog winner selection before any consolidation  
9. Split P1B; no bulk implementation  
10. Maintain all freezes including GSC  

---

## 4. Disposition under provisional Option B

| # | Topic | Locked provisional answer |
|---|-------|---------------------------|
| 1 | Local commercial canon | **Hubs-only** proposed spine |
| 2 | Stage 19 tree | **Not canonical**; keep redirected until separately scoped P1B |
| 3 | Airbnb area URLs (410) | **Not active landings**; remain 410 operationally; out of active matrices |
| 4 | City-intent ownership | **`/`** (not `/cleaning-services-cape-town`, not `/services` as primary city phrase) |
| 5 | Catalogue / comparison intent | **`/services`** |
| 6 | Synthetic authority blocks | **Publication freeze** |
| 7 | Price contradictions | **Reconcile required** before change; claim register path |
| 8 | Blog consolidation | **Evidence-led winner**; warn-only until then |
| 9 | Century City | **Unresolved** |
| 10 | P1B | **Split** into separately approved scopes |

### Split P1B family (not opened; separately approved only)

| Proposed ID | Scope (design/implement only when separately authorized) |
|-------------|----------------------------------------------------------|
| SEO-P1B-S19 | Stage 19 disposition: keep redirect vs delete tree vs re-enable (single decision) |
| SEO-P1B-OWN | Code ownership map (`KEYWORD_PRIMARY_ROUTE` / successors) + CI consumer |
| SEO-P1B-CLM | Local claim register + transactional price reconciliation package |
| SEO-P1B-SYN | Suppress synthetic cleaner bands / booking vignettes from public render |
| SEO-P1B-HUB | Hub expansion evidence standard (Century City and others) |
| SEO-P1B-BLOG | Evidence-led cluster winner selection process + tooling |

**Forbidden:** one bulk PR implementing multiple P1B scopes together.

---

## 5. Approved documentary scope

**In scope:**

* Baseline Matrices A–H as amended for conditions 1–10  
* Documentation corrections removing Stage 19 live-canonicity claims  
* Branch/PR filing for document-level review  

**Excluded / frozen:**

* Public content, redirects, metadata, schema, prices  
* Production, Plesk, analytics, Search Console writes  
* Any implementation, including “quick” ownership-map or synthetic-claim code changes  

---

## 6. Formal governance blocker

| Gate | Status |
|------|--------|
| SEO Engineering provisional Option B | **Recorded** |
| Document-level review (branch/PR) | **Required** — files must be reachable from reviewable ref |
| Constitution verified current + approved | **Pending** |
| Department Interaction Matrix verified current + approved | **Pending** |
| SEO Engineering mandate verified current + approved | **Pending** |
| Formal EO approval | **Blocked** until instruments above clear |

---

## 7. Approval block

| Field | Value |
|-------|-------|
| SEO Engineering provisional | **Option B — APPROVE WITH CONDITIONS** (2026-07-22) — **non-authoritative** |
| Formal approver | _______________ |
| Formal decision | ☐ Confirm Option B ☐ Amend ☐ Return ☐ Reject |
| Conditions 1–10 accepted? | ☐ Yes ☐ Yes with edits: _______________ |
| Implementation authorized in this package? | ☐ **No** (required default) |
| Controlling instruments verified? | ☐ Constitution ☐ Matrix ☐ SEO mandate |
| Effective date (formal) | _______________ |
| Signature / reference | _______________ |

---

## 8. Package file list

| Document | Path |
|----------|------|
| Control | `docs/audits/seo/SEO-P1A-CONTROL-2026-07-22.md` |
| Evidence matrices | `docs/audits/seo/SEO-P1A-EVIDENCE-MATRICES-2026-07-22.md` |
| Assessment | `docs/audits/seo/SEO-P1A-ASSESSMENT-2026-07-22.md` |
| Decision package (this file) | `docs/audits/seo/SEO-P1A-DECISION-PACKAGE-2026-07-22.md` |

**End of decision package. Stop before implementation. Freezes remain in force.**
