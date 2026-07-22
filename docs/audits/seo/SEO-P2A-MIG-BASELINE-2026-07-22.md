# SEO-P2A-MIG — Migration Read-Only Baseline

| Field | Value |
|-------|-------|
| Document ID | `SEO-P2A-MIG-BASELINE-2026-07-22` |
| Date | 2026-07-22 |
| Authorization | `SEO-P2-EO-AUTH-2026-07-22` |
| Work class | **Repo + public-web read-only** |
| Verdict | **PASS** |
| Production authority | **NONE** |

---

## 1. Purpose

Re-baseline the live `.com` → `.co.za` migration posture without Plesk edits, code changes, deployment, GSC access, or indexing requests.

---

## 2. Method

| Step | Action | Evidence class |
|------|--------|----------------|
| 1 | Read repo map `apps/web/lib/seo/shaleanComMigrationMap.ts` | **VF (repo)** |
| 2 | Run `vitest` on `shaleanComMigrationMap.test.ts` | **VF (repo)** |
| 3 | `curl -sI --max-redirs 0` against representative `.com` / `www` sources | **VF (public HTTP)** |
| 4 | Confirm destination `.co.za` URLs return 200 | **VF (public HTTP)** |
| 5 | Snapshot `robots.txt`, sitemap `<loc>` count, homepage canonical / JSON-LD signals | **VF (public HTTP)** |

Machine evidence: `docs/audits/seo/evidence/SEO-P2A-MIG-http-probes-2026-07-22.json`

---

## 3. Repo facts

| Item | Value |
|------|-------|
| `SHALEAN_COM_MIGRATION_STATUS` | `LIVE_HTTP_VERIFIED` |
| Explicit map rules | **193** |
| Unit tests | **15/15 passed** |
| Prior live apply evidence | `SHALEAN-COM-PLESK-FULL-MAP-HTTP-VERIFICATION-2026-07-22.md` (unchanged; not re-applied) |

---

## 4. Host baseline (public HTTP)

| URL | Status | Location |
|-----|--------|----------|
| `https://shalean.co.za/robots.txt` | 200 | — |
| `https://shalean.co.za/sitemap.xml` | 200 | — |
| `https://shalean.co.za/` | 200 | — |
| `https://www.shalean.co.za/` | 308 | `https://shalean.co.za/` |
| `https://shalean.com/` | 301 | `https://shalean.co.za/` |
| `https://www.shalean.com/` | 301 | `https://shalean.co.za/` |

---

## 5. Representative redirect probes

**18 / 18 PASS** (one-hop 301 to expected `.co.za` target; QSA + path-preserve fallback sampled).

Sample includes homepage, blog, services (slug remaps), location hubs, testimonials→reviews, how-it-works fragment, pricing→cost blog, unmapped path-preserve, and query-string preservation.

Full matrix in evidence JSON.

---

## 6. Destination availability

All sampled canonical destinations returned **200** with no redirect: `/`, `/services`, `/services/standard-cleaning-cape-town`, `/locations/sea-point-cleaning-services`, `/blog`, `/book`, `/contact`, `/reviews`.

---

## 7. Public crawl / indexability signals (snapshot)

| Signal | Observation |
|--------|-------------|
| `robots.txt` | `Allow: /` with admin/api/account-style disallows; declares `Sitemap: https://shalean.co.za/sitemap.xml` |
| Sitemap `<loc>` count | **102** (all `https://shalean.co.za/...`) |
| Homepage `<link rel="canonical">` | `https://shalean.co.za` |
| Homepage `og:url` | `https://shalean.co.za` |
| Homepage title | `Cleaning Services Cape Town from R250 \| Shalean` |
| Homepage robots meta | `index, follow` |
| JSON-LD | `LocalBusiness` + `WebSite` present in HTML |

---

## 8. Verdict

| Gate | Status |
|------|--------|
| Repo map present + status live | **PASS** |
| Map unit tests | **PASS** |
| Representative `.com` → `.co.za` one-hop redirects | **PASS** |
| Destination pages 200 | **PASS** |
| Canonical host robots/sitemap reachable | **PASS** |

**Overall: PASS** for read-only migration baseline.

---

## 9. Explicit non-actions

Not performed under this baseline:

- Plesk / FTP / `.htaccess` changes  
- Profile / GBP edits  
- Application code changes  
- Deployments  
- GSC property access, CoA, sitemap submit/remove, URL Inspection, indexing requests  

SEO-MIG-002 remains **Deferred**.

---

## 10. Record control

| Field | Value |
|-------|-------|
| Authorization | `docs/audits/seo/SEO-P2-EO-AUTH-2026-07-22.md` |
| Companion CWV baseline | `docs/audits/seo/SEO-P2C-CWV-BASELINE-2026-07-22.md` |
| Change authority | Documentary filing only |
