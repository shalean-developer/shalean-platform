# SEO-P2C-CWV — Core Web Vitals Lab Baseline

| Field | Value |
|-------|-------|
| Document ID | `SEO-P2C-CWV-BASELINE-2026-07-22` |
| Date | 2026-07-22 |
| Authorization | `SEO-P2-EO-AUTH-2026-07-22` |
| Work class | **Public-web read-only lab measurement** |
| Verdict | **BASELINED** (lab only; remediation not authorized) |
| Production authority | **NONE** |

---

## 1. Purpose

Capture a dated Core Web Vitals **lab** baseline on priority canonical URLs for regression comparison. No code, deploy, Plesk, profile, GSC, or indexing actions.

---

## 2. Method

| Attempt | Result |
|---------|--------|
| PageSpeed Insights API (`pagespeedonline/v5`) | **Blocked** — HTTP **429** quota exceeded for anonymous consumer |
| Local Lighthouse **13.4.1** + Chrome headless | **Completed** — mobile + desktop × 4 URLs |

Evidence:

- Summary: `docs/audits/seo/evidence/SEO-P2C-CWV-lighthouse-summary-2026-07-22.json`
- Raw reports: `docs/audits/seo/evidence/lh-*-2026-07-22.json`

**Not collected:** CrUX field data (p75 LCP/INP/CLS), GSC Core Web Vitals report.

---

## 3. URL set

| # | URL | Rationale |
|---|-----|-----------|
| 1 | `https://shalean.co.za/` | Homepage / city-intent landing |
| 2 | `https://shalean.co.za/locations/sea-point-cleaning-services` | Location hub |
| 3 | `https://shalean.co.za/services/standard-cleaning-cape-town` | High-value service page |
| 4 | `https://shalean.co.za/book` | Conversion path |

---

## 4. Lab results (Lighthouse 13.4.1)

CWV-oriented lab proxies. Thresholds referenced (lab guidance, not field pass/fail): LCP good ≤ 2500 ms; CLS good ≤ 0.1. TBT is a lab interactivity proxy (not INP).

### Mobile

| URL | Perf score | LCP (ms) | CLS | TBT (ms) | FCP (ms) | Speed Index (ms) |
|-----|------------|----------|-----|----------|----------|------------------|
| `/` | 43 | **6471** | 0 | 2575 | 1509 | 6010 |
| `/locations/sea-point-cleaning-services` | 48 | **5316** | 0 | 2394 | 1959 | 4032 |
| `/services/standard-cleaning-cape-town` | 71 | **4582** | 0 | 480 | 1489 | 3169 |
| `/book` | 66 | 2753 | 0.001 | 2051 | 1598 | 3486 |

### Desktop

| URL | Perf score | LCP (ms) | CLS | TBT (ms) | FCP (ms) | Speed Index (ms) |
|-----|------------|----------|-----|----------|----------|------------------|
| `/` | 73 | 1470 | 0.009 | 322 | 858 | 3363 |
| `/locations/sea-point-cleaning-services` | 97 | 1150 | 0 | 18 | 665 | 1104 |
| `/services/standard-cleaning-cape-town` | 78 | 1068 | 0 | 404 | 525 | 1784 |
| `/book` | 80 | 1323 | 0 | 321 | 763 | 1651 |

Fetch window: 2026-07-22T09:32:09Z → 2026-07-22T09:36:07Z (UTC).

---

## 5. Baseline reading (findings, not change orders)

| Finding | Class |
|---------|-------|
| CLS is healthy across the sampled set (all ≤ 0.009) | **Evidence-based finding** |
| Mobile LCP is poor on `/`, Sea Point hub, and standard service (all > 4000 ms) | **Evidence-based finding** |
| Desktop LCP is within “good” lab band on all four URLs | **Evidence-based finding** |
| Mobile TBT is high on `/`, Sea Point, and `/book` (> 2000 ms) | **Evidence-based finding** |
| Field CrUX / GSC CWV not available in this package | **Evidence gap** |

**Recommendation (not authorized):** Separate CWV remediation scope after EO change authorization. This baseline does **not** authorize performance code changes.

---

## 6. Explicit non-actions

Not performed:

- Application / CSS / image / font code changes  
- Deployment  
- Plesk or CDN configuration changes  
- Profile edits  
- GSC CWV report export or indexing requests  
- Treating lab scores as production ship gates  

---

## 7. Verdict

| Gate | Status |
|------|--------|
| Authorized measurement completed | **PASS** |
| Lab summary + raw JSON filed | **PASS** |
| Field CrUX | **GAP** (PSI 429) |
| Remediation | **Not authorized** |

**Overall: BASELINED** — documentary lab baseline only.

---

## 8. Record control

| Field | Value |
|-------|-------|
| Authorization | `docs/audits/seo/SEO-P2-EO-AUTH-2026-07-22.md` |
| Companion migration baseline | `docs/audits/seo/SEO-P2A-MIG-BASELINE-2026-07-22.md` |
| Change authority | Documentary filing only |
