# SEO-P1A — Repo-Only Assessment

| Field | Value |
|-------|-------|
| Document ID | `SEO-P1A-ASSESSMENT-2026-07-22` |
| Date | 2026-07-22 |
| Amended | 2026-07-22 — Option B provisional concurrence |
| Mode | Read-only inventory + documentary condition amendments |
| Evidence | `docs/audits/seo/SEO-P1A-EVIDENCE-MATRICES-2026-07-22.md` |
| Control | `docs/audits/seo/SEO-P1A-CONTROL-2026-07-22.md` |
| Status | **OPTION B provisional — baselining only; NO-GO for implementation** |

---

## 1. Verdict

**CONDITIONAL PASS for assessment completeness.**  
**Provisional Option B concurrence recorded** (SEO Engineering) — approve with conditions for **baselining only**.  
**NO-GO for implementation.** Freezes (including GSC) remain in force.  
**Formal governance approval blocked** until Constitution, Department Interaction Matrix, and SEO Engineering mandate are verified current and approved.

---

## 2. What is solid

1. **Hub catalogue is coherent** — 23 suburbs with region, type, pricing band, nearby, unique context, demand profile, localized FAQ.
2. **Editorial hub overrides exist** in `LOCATION_SEO_PAGES` for titles/intros/FAQs.
3. **Blog semantic clusters** are defined with seed membership and warn-only peer overlap tooling.
4. **Rebuild phase is documented** (`SEO_REBUILD_PHASE = 2`) with known 410 / redirect classes.
5. Edge behaviour already treats Stage 19 paths as legacy redirects — aligns with hubs-only proposed spine once docs stop calling Stage 19 canonical.

---

## 3. Material findings (aligned to Option B conditions)

| Pri | ID | Finding | Option B response |
|-----|----|---------|-------------------|
| P0 | A-F1 / D-F1 | Stage 19 docs/registry called URLs “canonical” while edge redirects | **Condition 2** — docs corrected; Stage 19 not proposed canon |
| P0 | F-F1 | Multiple from-price floors (R250 / R280 / bands) | **Condition 5** — reconcile to transactional SoT; no P1A price edits |
| P0 | F-F2 / E-F1 | Synthetic cleaner bands + recent-booking vignettes | **Condition 4** — publication freeze |
| P1 | OV-03 | 410 Airbnb area URLs listed as active landings | **Condition 6** — removed from active matrices |
| P1 | D1 | Stale city-intent → `/cleaning-services-cape-town` | **Condition 3** — proposed owners: `/` (city phrase), `/services` (catalogue) |
| P1 | A-F2 | Century City in Stage 19 without hub | **Condition 7** — unresolved; out of proposed spine |
| P2 | C-F1 | Warn-only blog overlap | **Condition 8** — evidence-led winner before any consolidation |
| P2 | — | Risk of bulk P1B | **Condition 9** — split scopes only |
| P0 | — | Change pressure | **Condition 10** — all freezes held |

---

## 4. Proposed canon (documentary — not shipped)

| Intent class | Proposed owner URL | Notes |
|--------------|-------------------|--------|
| Local suburb commercial | `/locations/{suburb}-cleaning-services` | **Sole proposed location spine** |
| Metro service commercial | `/services/{service}-cape-town` | Unchanged role |
| “Cleaning services Cape Town” (city phrase) | `/` | Replaces stale city-hub mapping |
| Service comparison / catalogue | `/services` | Not the primary city-phrase owner |
| Stage 19 `/{intent}/{suburb}` | **Not an owner** | Legacy / redirected until separate P1B-S19 |
| 410 Airbnb area editorials | **Not active landings** | Out of active matrices |
| Century City local hub | **None proposed** | Unresolved pending verified local evidence |

---

## 5. Follow-on scopes (not opened)

| ID | Scope | Gate |
|----|-------|------|
| SEO-P1B-S19 | Stage 19 disposition | Separate approval |
| SEO-P1B-OWN | Ownership map code + CI | Separate approval |
| SEO-P1B-CLM | Claim register + price reconciliation | Separate approval |
| SEO-P1B-SYN | Suppress synthetic public blocks | Separate approval |
| SEO-P1B-HUB | Hub expansion evidence (e.g. Century City) | Separate approval |
| SEO-P1B-BLOG | Evidence-led cluster winner process | Separate approval |

---

## 6. Explicit non-actions taken

This assessment did **not**:

* Change public pages, redirects, metadata, or schema  
* Change prices or pricing-band copy  
* Ship `KEYWORD_PRIMARY_ROUTE` code updates  
* Suppress synthetic UI in code  
* Deploy to production  
* Touch Plesk, analytics, or Search Console  
* Consolidate blog clusters  
* Create a Century City hub  

Documentary corrections only: Option B conditions recorded; Stage 19 / matrix language adjusted so Stage 19 is not presented as live-canonical; 410 Airbnb rows removed from active landing matrices; Century City marked unresolved.

---

## 7. Assessment sign-off

| Role | Outcome |
|------|---------|
| SEO Engineering (provisional) | **Option B — APPROVE WITH CONDITIONS** (non-authoritative); baselining only |
| Formal EO / governance | **Blocked** pending controlling instruments |
| Implementation | **Not authorized** |
