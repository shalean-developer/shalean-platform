# SEO-FIX-001/002 — GSC Validation & 8-Week Coverage Monitoring

| Field | Value |
|-------|-------|
| Document ID | `SEO-FIX-001-002-GSC-VALIDATION-AND-MONITORING-2026-07-22` |
| Date | 2026-07-22 |
| Authorization | **EO GSC validation — SEO-FIX-001/002 only** (`SEO-FIX-001/002-GSC-ONLY`) |
| Production merge | `28aa82ca2da8680baf88673fac20cdb5b0af80e0` (PR #89) |
| Production deploy | GitHub deployment `5557973699` at `2026-07-22T15:15:16Z` |
| Property | `GSC_SITE_URL` must be `sc-domain:shalean.co.za` (or `https://shalean.co.za`) |
| Sitemap feed | `https://shalean.co.za/sitemap.xml` (submit at most once; skip if already submitted after deploy) |

---

## 1. Authorized actions (exact)

1. **URL Inspection** for each of the five remediated service URLs.
2. **Conditional sitemap submit once:** only if latest GSC `lastSubmitted` predates production deploy `2026-07-22T15:15:16Z`; otherwise skip. Never loop/resubmit.
3. **Monitor coverage for eight weeks** via weekly **inspect-only** runs ending **2026-09-16**.

### In-scope URLs

* `https://shalean.co.za/services/deep-cleaning-cape-town`
* `https://shalean.co.za/services/airbnb-cleaning-cape-town`
* `https://shalean.co.za/services/office-cleaning-cape-town`
* `https://shalean.co.za/services/move-out-cleaning-cape-town`
* `https://shalean.co.za/services/window-cleaning-cape-town`
* `https://shalean.co.za/sitemap.xml` (sitemap decision only)

### Explicitly not authorized / not claimed via API

* Removals / temporary removals
* Property changes, user/ownership changes
* DNS / Plesk / Change of Address
* Any URL outside the five + the single sitemap feed
* **GSC UI “Request Indexing”** — the ordinary Search Console API does **not** expose this manual action for these standard service pages. Do **not** claim it was executed via API. Manual UI action remains separate if operators choose it.
* Indexing API `urlNotifications.publish` is **out of scope** for this validation (not equivalent to Request Indexing for these pages)

---

## 2. Safest execution path (Vercel Production GSC_* in-place)

Existing Production `gsc-sync` (`/api/cron/gsc-sync`) is **readonly metrics sync** for `/locations/` hubs — it does not inspect these service URLs or submit sitemaps.

**Preferred:** authenticated Production cron that reuses the same server-side `GSC_*` already on Vercel Production:

```bash
curl -sS -X POST "https://shalean.co.za/api/cron/gsc-seo-fix-001-002-validate" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"confirm":"SEO-FIX-001/002-GSC-ONLY","mode":"validate"}'
```

* Auth: same `CRON_SECRET` gate as `gsc-sync` (not publicly callable).
* Refuses Preview/Staging.
* Never prints `GSC_PRIVATE_KEY` / raw service-account email (masked only).

**CLI fallback** (Production env only, gitignored):

```bash
cd apps/web
# vercel env pull .env.local --environment=production  # do not commit
npm run gsc:seo-fix-001-002-validate -- --confirm=SEO-FIX-001/002-GSC-ONLY --mode=validate
```

Script: `apps/web/scripts/gsc-seo-fix-001-002-validation.ts`  
Library: `apps/web/lib/gsc/seo-fix-001-002-validation.ts`  
Cron: `apps/web/app/api/cron/gsc-seo-fix-001-002-validate/route.ts`

| Action | API |
|--------|-----|
| Inspect | Search Console URL Inspection `urlInspection.index.inspect` |
| Sitemap (conditional) | `sitemaps.list` / `sitemaps.get` then at most one `sitemaps.submit` |
| Request Indexing (UI) | **Manual GSC UI only** — not executed / not claimed via API |

Scope on JWT: `webmasters` (no Indexing API scope).

---

## 3. Execution log

| Step | Status | Evidence |
|------|--------|----------|
| Production SHA | Confirmed `28aa82ca2da8680baf88673fac20cdb5b0af80e0` via `/api/health/environment` | Live probe |
| Production deploy time | `2026-07-22T15:15:16Z` (deployment `5557973699`) | GitHub Deployments API |
| Safest invoke path | Production cron `/api/cron/gsc-seo-fix-001-002-validate` + `CRON_SECRET` + confirm phrase | This doc §2 |
| Credentials in agent env | Not mounted (`GSC_*` / `VERCEL_TOKEN` / `CRON_SECRET` absent in cloud agent) | Names-only env audit |
| Live URL Inspection ×5 | **Pending** Production cron deploy + `CRON_SECRET` invoke (or `npm run gsc:seo-fix-001-002-validate:from-vercel-production`) | Preflight `docs/audits/seo/evidence/SEO-FIX-001-002-GSC-VALIDATION-PREFLIGHT-2026-07-22.json`; §5 |
| Sitemap decision | Pending live run (submit only if `lastSubmitted` &lt; deploy time) | §5 |
| Request Indexing (API) | **Not executed** (not available / not authorized as API claim) | Manual UI if desired |
| Secrets logged | `secretsLogged: false` enforced in evidence schema | Library |

---

## 4. Eight-week inspect-only monitoring

| Field | Value |
|-------|-------|
| Cadence | Weekly Wednesdays 09:00 UTC |
| Cron | `0 9 * * 3` |
| Window | `2026-07-29` → `2026-09-16` (**8 runs**) |
| Mode | `inspect-only` |
| Workflow | `.github/workflows/gsc-seo-fix-001-002-weekly-inspect.yml` |

### Weekly runs cannot

* Submit the sitemap
* Request indexing (API or claimed UI automation)
* Submit removals
* Change properties
* Use Change of Address
* Inspect unrelated URLs

### Weekly checklist

| Week | Date | Deep | Airbnb | Office | Move-out | Window | Notes |
|------|------|------|--------|--------|----------|--------|-------|
| W0 baseline | 2026-07-22 | | | | | | One-shot `validate` mode |
| W1 | 2026-07-29 | | | | | | inspect-only |
| W2 | 2026-08-05 | | | | | | inspect-only |
| W3 | 2026-08-12 | | | | | | inspect-only |
| W4 | 2026-08-19 | | | | | | inspect-only |
| W5 | 2026-08-26 | | | | | | inspect-only |
| W6 | 2026-09-02 | | | | | | inspect-only |
| W7 | 2026-09-09 | | | | | | inspect-only |
| W8 close | 2026-09-16 | | | | | | Final inspect-only |

---

## 5. Live evidence template (fill from cron/CLI JSON)

Record from evidence JSON (never paste secret values):

* Execution time (`authorizedAt`)
* Production deployment/SHA (`productionMergeSha`, `productionDeployedAt`)
* Property identifier (`siteUrl`) + `siteUrlAuthorized`
* Service account access (`serviceAccountHasPropertyAccess`, `clientEmailMasked` only)
* Per URL: `verdict`, `coverageState`, `robotsTxtState`, `pageFetchState`, `lastCrawlTime`
* Sitemap decision (`sitemap.action`, `reason`, `errors`, `warnings`)
* `secretsLogged: false`
* Weekly schedule (`weeklyMonitor`)
* Actions completed vs manual GSC UI still required (`requestIndexingUiRequired`)

Evidence paths (gitignored `apps/web/tmp/` or Actions artifacts):

* `gsc-seo-fix-001-002-validation-*.json`
* `gsc-seo-fix-001-002-weekly-inspect.json`

---

## 6. Authorization wording (record)

> **Authorize GSC validation for SEO-FIX-001/002 only (`SEO-FIX-001/002-GSC-ONLY`): inspect the five remediated service URLs, conditionally submit https://shalean.co.za/sitemap.xml once if not already submitted after the SEO-FIX production deploy, and run eight weekly inspect-only checks through 2026-09-16. Do not authorize removals, property changes, DNS/Plesk changes, Change of Address, Indexing API publish, or claiming GSC UI Request Indexing via API.**

Status: **Authorization accepted.** Preferred runtime: **Vercel Production cron** using existing Production `GSC_*`.
