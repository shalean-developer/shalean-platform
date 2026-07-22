# SEO-FIX-001/002 — GSC Validation & 8-Week Coverage Monitoring

| Field | Value |
|-------|-------|
| Document ID | `SEO-FIX-001-002-GSC-VALIDATION-AND-MONITORING-2026-07-22` |
| Date | 2026-07-22 |
| Authorization | **EO GSC read/write validation — SEO-FIX-001/002 only** |
| Production merge | `28aa82ca2da8680baf88673fac20cdb5b0af80e0` (PR #89 tip `41955c1a…`) |
| Property | Prefer `sc-domain:shalean.co.za` (`GSC_SITE_URL`) |
| Sitemap (single submit) | `https://shalean.co.za/sitemap.xml` |

---

## 1. Authorized actions (exact)

1. **URL Inspection** for each of the five remediated service URLs.
2. **Submit sitemap once:** `https://shalean.co.za/sitemap.xml`.
3. **Request indexing once** for each of the five URLs.
4. **Monitor coverage for eight weeks** (see §4).

### In-scope URLs

* `https://shalean.co.za/services/deep-cleaning-cape-town`
* `https://shalean.co.za/services/airbnb-cleaning-cape-town`
* `https://shalean.co.za/services/office-cleaning-cape-town`
* `https://shalean.co.za/services/move-out-cleaning-cape-town`
* `https://shalean.co.za/services/window-cleaning-cape-town`

### Explicitly not authorized

* Removals / temporary removals
* Property changes, user/ownership changes
* DNS changes / Change of Address
* Any URL outside the five + the single sitemap feed
* Booking-v2, claims, deploy, or code changes beyond the validation runner

---

## 2. Execution tool

```bash
cd apps/web
# Requires GSC_CLIENT_EMAIL, GSC_PRIVATE_KEY, GSC_SITE_URL
npm run gsc:seo-fix-001-002-validate
```

Script: `apps/web/scripts/gsc-seo-fix-001-002-validation.ts`  
Evidence JSON: `apps/web/tmp/gsc-seo-fix-001-002-validation-*.json` (gitignored via `tmp/`)

API mapping:

| Action | API |
|--------|-----|
| Inspect | Search Console URL Inspection `urlInspection.index.inspect` |
| Sitemap submit | Search Console `sitemaps.submit` for the single feedpath |
| Request indexing | Indexing API `urlNotifications.publish` type `URL_UPDATED` (once per URL) |

Scopes required on the service account JWT: `webmasters` + `indexing`. Service account must be added on the GSC property with sufficient access (Owner recommended for Indexing API).

---

## 3. Execution log

| Step | Status | Evidence |
|------|--------|----------|
| Credentials available in agent env | **BLOCKED** at first attempt — `GSC_CLIENT_EMAIL` / `GSC_PRIVATE_KEY` / `GSC_SITE_URL` not present in cloud agent environment | See §5 |
| URL Inspection ×5 | Pending credentials | — |
| Sitemap submit ×1 | Pending credentials | — |
| Indexing request ×5 | Pending credentials | — |

When credentials are injected, re-run `npm run gsc:seo-fix-001-002-validate` once and paste the evidence JSON summary into §5.

---

## 4. Eight-week coverage monitoring plan

| Field | Value |
|-------|-------|
| Start | 2026-07-22 (production live + GSC actions) |
| End | 2026-09-16 (8 weeks) |
| Cadence | Weekly URL Inspection of the five URLs only |
| Pass signal | Coverage moves toward indexed / “Submitted and indexed” (or stable PASS) without new soft-404 / excluded-by-noindex |
| Watch | `coverageState`, `verdict`, `lastCrawlTime`, `googleCanonical` (must stay apex `https://shalean.co.za/...`) |

### Weekly checklist (copy per week)

| Week | Date window | Deep | Airbnb | Office | Move-out | Window | Notes |
|------|-------------|------|--------|--------|----------|--------|-------|
| W0 baseline | 2026-07-22 | | | | | | Post-submit inspect |
| W1 | 2026-07-29 | | | | | | |
| W2 | 2026-08-05 | | | | | | |
| W3 | 2026-08-12 | | | | | | |
| W4 | 2026-08-19 | | | | | | |
| W5 | 2026-08-26 | | | | | | |
| W6 | 2026-09-02 | | | | | | |
| W7 | 2026-09-09 | | | | | | |
| W8 close | 2026-09-16 | | | | | | Final inspect + Performance peek (impressions) |

Optional weekly command (inspect-only subset — do **not** re-submit sitemap or re-request indexing unless separately authorized):

```bash
# Re-use validation script only after editing to inspect-only, or run URL Inspection manually in GSC UI for the five URLs.
```

Do **not** bulk-request indexing again during the monitoring window without a new EO phrase.

---

## 5. Credential injection requirement

Cloud agent run could not execute live GSC writes because production GSC service-account env vars are not mounted here (they exist for Vercel Production cron `gsc-sync` only).

**To complete authorized actions now:**

1. Export into the runner environment (or `apps/web/.env.local`, gitignored):
   * `GSC_CLIENT_EMAIL`
   * `GSC_PRIVATE_KEY` (escaped newlines OK)
   * `GSC_SITE_URL=sc-domain:shalean.co.za` (or the exact verified property string)
2. Confirm the service account is on the property with access sufficient for Inspection + Sitemap submit + Indexing.
3. Run `npm run gsc:seo-fix-001-002-validate` **once**.
4. Attach evidence JSON path + verdict table to this document §3.

---

## 6. Authorization wording (record)

> **Authorize GSC read/write validation for SEO-FIX-001/002 only: inspect the five remediated service URLs, submit https://shalean.co.za/sitemap.xml once, request indexing once for each of the five URLs, and monitor their coverage for eight weeks. Do not authorize removals, property changes, DNS changes, Change of Address, or actions affecting URLs outside this scope.**

Status: **Authorization accepted.** Live API execution **pending credential injection** into the runner (§5).
