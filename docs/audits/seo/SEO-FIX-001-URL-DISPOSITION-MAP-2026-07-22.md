# SEO-FIX-001 — URL Disposition Map (2026-07-22)

| Field | Value |
|-------|-------|
| Document ID | `SEO-FIX-001-URL-DISPOSITION-MAP-2026-07-22` |
| Date | 2026-07-22 |
| Authority | **Provisional** — user-authorised repository-only SEO Engineering package; formal EO / Constitution / SEO mandate instruments **not verified** |
| Companion CSV | `docs/audits/seo/SEO-FIX-001-URL-DISPOSITION-MAP-2026-07-22.csv` |
| Production / GSC / deploy authority | **NONE** |

---

## 1. Purpose

Inventory repository-generated and legacy public URL classes under `/locations/`, `/location/`, `/growth/local/`, `/services/`, host aliases (`www`, `shalean.com`), and related legacy cleaning/pricing/booking routes. Assign a disposition using only:

`KEEP` · `IMPROVE` · `301_REDIRECT` · `NOINDEX` · `410_REMOVE` · `REVIEW_REQUIRED`

**Preferred location spine:** `/locations/{suburb}-cleaning-services` (23 hubs), unless a material conflict requires escalation.

---

## 2. Baseline behaviour (repo, before this package’s docs)

| Surface | Observed behaviour |
|---------|-------------------|
| Canonical host | Apex `https://shalean.co.za` (`lib/site/canonical.ts`; www rewritten) |
| `www.shalean.co.za` | Permanent host redirect → apex path-preserve (`next.config.ts`) |
| HTTP → HTTPS | Platform / hosting (preserved; not changed here) |
| Location hubs | Live at `SEO_REBUILD_PHASE = 2`; sitemap included |
| `/location/*`, `/growth/local/*`, Stage-19 | Edge `proxy.ts` → 308 hub/service or 410 |
| Metro services (7) | 200, `index,follow`, self-canonical, core sitemap |
| `/details` | 308 → `/book` (legacy marketing matrix) |
| `/booking/details` | Transactional `noindex` |
| `/cleaner/apply/form` | `noindex, nofollow` + robots Disallow `/cleaner` |

No material conflict was found against adopting `/locations/` as the preferred location architecture. Century City remains **unresolved** (no hub) — Stage-19 / growth fallbacks to metro services are `REVIEW_REQUIRED`.

---

## 3. Disposition totals (CSV rows)

Machine-readable inventory: **253 rows**.

| Disposition | Count |
|-------------|------:|
| `KEEP` | 36 |
| `IMPROVE` | 5 |
| `301_REDIRECT` | 191 |
| `410_REMOVE` | 9 |
| `NOINDEX` | 5 |
| `REVIEW_REQUIRED` | 7 |
| **Total** | **253** |

Notes:

* Live edge redirects are often HTTP **308**; disposition label uses `301_REDIRECT` as the allowed vocabulary for permanent one-hop consolidation.
* Growth-local hub expansions are enumerated (5 intents × 23 hubs). Blog cleanup and `.com` maps are represented as pattern rows plus concrete legacy marketing sources — full 193-entry `.com` map remains in `shaleanComMigrationMap.ts` / prior MIG docs.
* `IMPROVE` rows are the five GSC-unindexed metro service pages (see SEO-FIX-002).

---

## 4. Architecture decisions

| Decision | Disposition implication |
|----------|-------------------------|
| Sole location spine = `/locations/{suburb}-cleaning-services` | Hubs `KEEP`; singular `/location/` and growth/local → spine `301_REDIRECT` or `410_REMOVE` |
| Stage-19 not canonical | Edge redirect destinations retained; code-tree retirement deferred (`SEO-P1B-S19`) |
| Century City unresolved | Intent×century-city → metro service remains `REVIEW_REQUIRED` |
| City phrase ownership (`cleaning-services-cape-town` → `/` vs `/services`) | Live redirect to `/services` marked `REVIEW_REQUIRED` pending `SEO-P1B-OWN` |
| Airbnb area editorials | `410_REMOVE` (Condition 6) |
| Transactional booking | `/book`, `/booking/*` `NOINDEX`; legacy `/details` already redirects to `/book` |

---

## 5. CSV schema

Columns: `source_url`, `route_or_template`, `http_behavior`, `indexability`, `canonical_url`, `sitemap`, `internal_link_sources`, `search_intent`, `preferred_destination`, `proposed_disposition`, `reason`, `architecture_class`.

---

## 6. Escalations / confirmation needed

| Item | Owner |
|------|-------|
| Formal governance approval of SEO Engineering mandate / Constitution / Interaction Matrix | Executive Office |
| Century City hub create vs permanent service-only fallback | Marketing + SEO Eng + EO |
| City-phrase destination `/` vs `/services` code map | SEO Eng (`SEO-P1B-OWN`) |
| Stage-19 route tree deletion vs long-term edge-only | SEO Eng (`SEO-P1B-S19`) |
| `.com` catch-all unknowns that 404 on `.co.za` | Ops + SEO Eng |

---

## 7. Record control

| Field | Value |
|-------|-------|
| Nature | Provisional disposition map + CSV |
| Code changes in this package | Documentation only for FIX-001 map; redirect behaviour already live — **no new redirect engineering** in this package |
| Companion production package | SEO-FIX-002 + PR #89 branch `seo/fix-001-002-prod-ready` (tip SHA recorded in FIX-002 §4.0 after verification) |
| Supersession | Does not supersede SEO-MIG-002 Deferred or SEO-P2 EO read-only auth |
