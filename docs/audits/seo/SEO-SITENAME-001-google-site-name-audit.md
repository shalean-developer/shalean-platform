# SEO-SITENAME-001 — Google Search Site Name Audit

## 1. Document Control

| Field | Value |
|-------|-------|
| Audit ID | `SEO-SITENAME-001` |
| Title | Google Search displays domain (`shalean.co.za`) instead of preferred site name (`Shalean Cleaning Services`) |
| Classification | Internal — SEO Engineering / Marketing Brand / Engineering |
| Status | Complete (read-only) |
| Audit date | 2026-07-21 |
| Auditor | Cursor agent (evidence-based read-only review) |
| Repository | `shalean-platform` |
| Mode | **READ-ONLY AUDIT** |
| Change authority | **NONE** |
| Canonical website (in scope) | `https://shalean.co.za/` |
| Out of scope brands/domains | `shalean.com`, `bokkiecleaning.co.za`, `faraios.com`, unrelated repos |
| Code/config/external mutations | **None** — application code, schema, env, Search Console, GBP, and listings unchanged |
| Allowed repository change | This audit document only |
| Production identity (health) | `deployment=production`, `gitBranch=main`, Supabase `tchayecuvzssixyxlvfu`, Paystack live (observed 2026-07-21 via `/api/health/environment`) |

### Evidence classification key

- **Verified fact** — observed in production HTTP response, repository source at audit time, or public page title fetch
- **Technical inference** — follows from verified facts and Google’s published site-name guidance
- **Hypothesis** — plausible but not confirmed (especially indexing / GBP / Search Console state)
- **Governance ambiguity** — ownership or policy not fully documented in-repo

---

## 2. Executive Summary

Production homepage technical site-name signals are **largely correctly implemented** and **match the repository**:

- `WebSite.name` = `Shalean Cleaning Services`
- `og:site_name` = `Shalean Cleaning Services`
- `LocalBusiness.name` / `CleaningService.name` = `Shalean Cleaning Services`
- Canonical host = apex `https://shalean.co.za` (www → apex)
- Homepage is `index, follow`; JSON-LD is present in the **raw server HTML** (Suspense-streamed, not client-only)

Google Search is still showing the **domain** as the site name. Per [Google Search Central — Site names](https://developers.google.com/search/docs/appearance/site-names), that is an expected automated outcome when Google is **not confident** enough to use the preferred `WebSite.name`. Google’s own remediation ladder then recommends `alternateName` (including the short brand, and optionally the domain as last backup). The live `WebSite` node **does not include `alternateName`**.

**Audit decision: CONDITIONAL PASS**

Core required signals are present and consistent with production. Material gaps remain: missing recommended `alternateName`, SERP title brand suffix uses only `Shalean`, soft duplicate `/index`, trailing-slash inconsistency between sitemap and canonical, and unverified Search Console / Google Business Profile state.

| Authorization | Status |
|---------------|--------|
| REMEDIATION AUTHORIZATION | **NOT GRANTED** |
| PRODUCTION CHANGE AUTHORIZATION | **NOT GRANTED** |
| EXTERNAL PLATFORM CHANGE AUTHORIZATION | **NOT GRANTED** |

---

## 3. Scope and Decision Context

### In scope

- Why Google Search may display `shalean.co.za` instead of `Shalean Cleaning Services`
- Repository homepage metadata / structured data / branding / canonical utilities
- Live production HTTP + HTML for `https://shalean.co.za/` and alternate URL variants
- Public social profile titles (read-only)
- Smallest safe remediation plan (recommendation only)

### Out of scope (explicit)

- Implementing fixes, PRs, deploys, env changes
- Editing Search Console, GBP, social listings, DNS, redirects
- Other brands / domains listed in §1
- Guaranteeing Google will adopt a preferred site name after any change

### Observed Google presentation (reported)

| Element | Observed value |
|---------|----------------|
| Site name | `shalean.co.za` |
| Page title | `Cleaning Services Cape Town from R250 \| Shalean` |

This matches the live `<title>` and is consistent with Google falling back to the **domain** for the site-name line while using the page title link separately.

---

## 4. Governance and Authority

### Documents consulted

| Document | Relevance | Notes |
|----------|-----------|-------|
| `docs/BLOG_SEO_GOVERNANCE_SUMMARY.md` | Editorial SEO / canonical purity | Blog-route focused; does not define site-name standards |
| `docs/stage-19-local-seo-domination.md` | Local SEO page/schema expectations | Money-page schema guidance; not site-name specific |
| `docs/runbooks/h02b-production-change-control-2026-07-14.md` | Production change control pattern | High-risk DB change control; establishes gated production changes |
| `docs/audits/billing-invoices/BILL-INV-002/00-document-control.md` | Audit evidence format | Used as document-control template |
| `docs/audits/customer-booking-journey-seos-audit-2026-07-13.md` | SEOS governance gap note | States formal SEOS Engineering Principles / Audit Playbook artefacts are **missing** |
| Prior marketing audits under `docs/audits/marketing/` | Brand naming in project headers | Consistently use **Shalean Cleaning Services** as project/business label |
| Google Search Central — Site names | Authoritative site-name rules | https://developers.google.com/search/docs/appearance/site-names |
| Schema.org `WebSite` | Type definitions | https://schema.org/WebSite / https://google.schema.org/WebSite |

### Ownership boundaries (applied)

| Owner | Responsibility |
|-------|----------------|
| SEO Engineering | Technical SEO findings, structured-data / metadata standards for this audit |
| Marketing / Brand | Approved public business naming (`Shalean Cleaning Services` preferred; `Shalean` short) |
| Engineering | Implementation of approved code changes (not authorized in this phase) |
| Executive | Approval for production / external platform changes where applicable |

### Governance ambiguities (recorded, not assumed away)

1. **No dedicated in-repo “SEO Engineering site-name standard”** defining required `WebSite` properties (`name`, `alternateName`, `url`) or the approved SERP title brand suffix.
2. **Preferred vs short name policy** is implied by product usage (`site.webmanifest` `name` / `short_name`, OG `siteName`, titles using `| Shalean`) but not ratified in a single brand governance doc inside this repository.
3. **Formal SEOS artefacts** (Engineering Principles, Audit Playbook) remain missing per prior SEOS audit note — this report follows existing `docs/audits/**` practice.
4. Audit documentation under `docs/audits/` is an established pattern; creating this report is treated as permitted. Application code remains frozen.

---

## 5. Current Google Search Presentation

| Signal | Value |
|--------|-------|
| Reported site name | `shalean.co.za` |
| Reported title link | `Cleaning Services Cape Town from R250 \| Shalean` |
| Canonical site under review | `https://shalean.co.za/` |

**Interpretation (technical inference):** Google’s site-name system is automated and may show a domain when confidence in the preferred name is low ([Site names docs — “What to do if your preferred site name isn't selected”](https://developers.google.com/search/docs/appearance/site-names)). The title link is independently correct relative to live `<title>`.

---

## 6. Repository Architecture and Metadata Ownership

### Homepage route stack

| Layer | Path | Role |
|-------|------|------|
| Root layout metadata | `apps/web/app/layout.tsx` → `ROOT_METADATA` | Global `metadataBase`, default title template, default OG/Twitter, robots |
| Root metadata source | `apps/web/lib/site/rootMetadata.ts` | Default title `Shalean Cleaning Services` (prod); reuses home OG |
| Marketing layout | `apps/web/app/(marketing)/layout.tsx` | Promo chrome only — **no metadata** |
| Homepage route | `apps/web/app/(marketing)/page.tsx` | Route metadata: title, description, robots, canonical, OG, Twitter |
| Home meta constants | `apps/web/lib/seo/homePageMeta.ts` | `HOME_PAGE_TITLE`, `HOME_OPEN_GRAPH.siteName`, canonical helpers |
| Canonical origin | `apps/web/lib/site/canonical.ts` | `SITE_ORIGIN` / `absoluteCanonicalUrl`; apex fallback `https://shalean.co.za`; strips `www` |
| JSON-LD graph helpers | `apps/web/lib/seo/schemaGraph.ts` | `buildWebSiteJsonLdNode`, `buildWebPageJsonLdNode` |
| Local business base | `apps/web/lib/seo/primaryLocalBusinessJsonLd.ts` | `LocalBusiness` name/url/image/sameAs |
| Homepage JSON-LD UI | `apps/web/components/home/StructuredData.tsx` | Assembles homepage `@graph` |
| Mount point | `apps/web/components/marketing-home/MarketingHomeDbSections.tsx` | Renders `<StructuredData />` inside `Suspense` after hero |
| Manifest | `apps/web/public/site.webmanifest` | `name` / `short_name` |
| Brand logo | `apps/web/components/brand/ShaleanNavLogo.tsx` | `alt="Shalean Cleaning Services"` |
| Social sameAs source | `apps/web/lib/site/brandSameAs.ts` | Env-driven Facebook/Instagram/LinkedIn/GBP URLs |

### Metadata overwrite layers (homepage)

1. `ROOT_METADATA` sets defaults including `openGraph: HOME_OPEN_GRAPH` and default title **Shalean Cleaning Services**.
2. Homepage `export const metadata` **overrides** title to `HOME_PAGE_TITLE` (`… | Shalean`) and re-asserts OG/Twitter/canonical/robots.
3. No middleware rewrite of homepage metadata observed for apex host.
4. JSON-LD is **not** in `metadata` API; it is a server component script in the page body (streamed).

### Key repository values (homepage-affecting)

| Item | File | Lines (approx.) | Exact value | Server-rendered? | Production expected? |
|------|------|-----------------|-------------|------------------|----------------------|
| SERP title | `homePageMeta.ts` | 13–17 | `Cleaning Services Cape Town from R250 \| Shalean` | Yes (Next metadata) | Yes |
| `og:site_name` | `homePageMeta.ts` | 25–28 | `Shalean Cleaning Services` | Yes | Yes |
| Root default title | `rootMetadata.ts` | 20–30 | `Shalean Cleaning Services` | Yes (overridden on home) | Yes |
| `WebSite.name` | `schemaGraph.ts` | 36–44 | `Shalean Cleaning Services` | Yes (body JSON-LD) | Yes |
| `WebSite.alternateName` | `schemaGraph.ts` | — | **Not set** | N/A | Missing |
| `WebSite.url` | `schemaGraph.ts` | 40 | `SITE_ORIGIN` (`https://shalean.co.za`) | Yes | Yes |
| `LocalBusiness.name` | `primaryLocalBusinessJsonLd.ts` | 29–35 | `Shalean Cleaning Services` | Yes | Yes |
| `LocalBusiness.logo` | `primaryLocalBusinessJsonLd.ts` | — | **Not set** (uses `image` only) | N/A | Missing logo property |
| `CleaningService.name` | `StructuredData.tsx` | 83–87 | `Shalean Cleaning Services` | Yes | Yes |
| Manifest name | `site.webmanifest` | 2–3 | `Shalean Cleaning Services` / short `Shalean` | Static | Yes |
| About nested WebSite | `AboutPageView.tsx` | 52–58 | `isPartOf.WebSite.name: "Shalean"` | About page only | Yes (inconsistency) |

---

## 7. Live Production Evidence

Captured 2026-07-21 via direct HTTP (`Invoke-WebRequest`), without mutating systems.

### Redirect / URL matrix

| URL | Status | Location / notes |
|-----|--------|------------------|
| `http://shalean.co.za/` | 308 | → `https://shalean.co.za/` |
| `https://shalean.co.za/` | 200 | Final homepage |
| `http://www.shalean.co.za/` | 308 | → `https://www.shalean.co.za/` |
| `https://www.shalean.co.za/` | 307 | → `https://shalean.co.za/` |
| `https://shalean.co.za` (no slash) | 200 | Same content family; no redirect hop |
| `https://shalean.co.za/?utm_source=audit` | 200 | Canonical still apex |
| `https://shalean.co.za/home` | 404 | Not a duplicate homepage |
| `https://shalean.co.za/index` | **200** | **Same title/length as `/`** — soft duplicate URL |

### Final homepage SEO extract (`https://shalean.co.za/`)

| Field | Live value |
|-------|------------|
| HTTP status | 200 |
| `<title>` | `Cleaning Services Cape Town from R250 \| Shalean` |
| Meta description | Book trusted cleaning services in Cape Town… |
| Canonical | `https://shalean.co.za` (no trailing slash) |
| Robots | `index, follow` |
| `og:site_name` | `Shalean Cleaning Services` |
| `og:title` | Same as `<title>` |
| `og:url` | `https://shalean.co.za` |
| `og:type` | `website` |
| Twitter card | `summary_large_image` |
| JSON-LD blocks | **1** (`@graph` with 12 nodes) |
| H1 | `Cleaning Services Cape Town from R250` |
| Logo alt | `Shalean Cleaning Services` |
| Footer copyright | `© {year} Shalean Cleaning Services. All rights reserved.` |
| Host headers | `Server: Vercel`, `X-Vercel-Cache: HIT`, HSTS present |

### Raw HTML vs JS hydration

| Signal | In raw HTML response? | Notes |
|--------|----------------------|-------|
| Title / OG / canonical / robots | Yes | In document head early |
| JSON-LD | **Yes** | Present in full HTTP body at ~byte 50k |
| JSON-LD placement | Inside Next Suspense slot `<div hidden id="S:0">` | Server-streamed; **not** client-only insert |
| Visible brand strings | Yes | Logo alt, footer, scattered copy |

**Conclusion:** Important site-name signals are available without relying on client hydration. Suspense streaming defers JSON-LD after the hero, but crawlers that consume the completed HTML response receive it.

### Repository vs production drift

| Area | Drift? |
|------|--------|
| Title / OG site name / WebSite.name / LocalBusiness.name | **No material drift** — live matches repo constants |
| Canonical trailing slash | Minor: sitemap `https://shalean.co.za/`; live canonical `https://shalean.co.za` |
| Deployment identity | Production `main` via health endpoint |

---

## 8. Site-Name Signal Matrix

| Signal | Repository value | Live production value | Preferred value | Status |
|--------|------------------|----------------------|-----------------|--------|
| HTML title | `Cleaning Services Cape Town from R250 \| Shalean` | Same | Brand clarity: full name preferred in site-name system; title may keep short brand | **PARTIAL** |
| Visible header brand | Logo + `alt="Shalean Cleaning Services"` | Same | Preferred name via alt/logo | **PASS** |
| Homepage H1/context | Keyword H1; badge “Cape Town's trusted cleaning service” | Same | H1 need not be legal name; entity clarity is soft | **PARTIAL** |
| `og:site_name` | `Shalean Cleaning Services` | `Shalean Cleaning Services` | `Shalean Cleaning Services` | **PASS** |
| `WebSite.name` | `Shalean Cleaning Services` | `Shalean Cleaning Services` | `Shalean Cleaning Services` | **PASS** |
| `WebSite.alternateName` | Not present | Not present | `Shalean` (± optional domain backup) | **NOT PRESENT** |
| `WebSite.url` | `https://shalean.co.za` | `https://shalean.co.za` | `https://shalean.co.za/` (docs often show trailing slash) | **PARTIAL** |
| `Organization.name` | No separate Organization on home; About page has Organization | Homepage uses LocalBusiness | Preferred name on org-like entity | **PARTIAL** |
| `Organization.url` | N/A on home | N/A on home | Apex URL | **NOT APPLICABLE** (home uses LocalBusiness) |
| Local business name | `Shalean Cleaning Services` | `Shalean Cleaning Services` | `Shalean Cleaning Services` | **PASS** |
| Canonical URL | `absoluteCanonicalUrl("/")` | `https://shalean.co.za` | Apex homepage | **PASS** |
| Logo metadata | Logo PNG exists; LocalBusiness uses marketing `image`, **no `logo`** | Same | Prefer schema `logo` ImageObject | **PARTIAL** |
| Footer business name | `Shalean Cleaning Services` | Same | Preferred name | **PASS** |
| Social profile naming | FB/IG URLs in sameAs + footer links | FB title / IG title use preferred name (public fetch) | Preferred name | **PASS** (public) |
| Google Business Profile name | Env URL may feed sameAs | Not authenticated in this audit | Preferred name + apex URL | **NOT VERIFIED** |
| Search Console indexing state | Script readiness exists; no GSC API access here | Unknown | Homepage indexed with preferred site name | **NOT VERIFIED** |

---

## 9. Structured-Data Assessment

### Homepage JSON-LD graph (live)

Single block: `@context=https://schema.org`, `@graph` length **12**.

| `@type` | `@id` | `name` | Notes |
|---------|-------|--------|-------|
| WebSite | `…/#website` | Shalean Cleaning Services | **No `alternateName`**; `url` apex; `publisher` → LocalBusiness |
| WebPage | `…/#webpage` | Cleaning Services Cape Town from R250 | `isPartOf` Website; `about` LocalBusiness |
| LocalBusiness | `…/#localbusiness` | Shalean Cleaning Services | `image` OK; **no `logo`**; `sameAs` FB + IG |
| OfferCatalog | `…/#offer-catalog` | Cleaning services | |
| CleaningService | `…/#cleaningservice` | Shalean Cleaning Services | `provider` → LocalBusiness |
| Service ×6 | `…/#service-*` | Service titles | `provider` → LocalBusiness |
| FAQPage | `…/#faq` | (none) | Linked to WebPage / LocalBusiness |

### Required WebSite properties vs Google docs

| Property | Required/Recommended | Observed | Assessment |
|----------|----------------------|----------|------------|
| `@type: WebSite` | Required pattern | Present | PASS |
| `name` | Required | `Shalean Cleaning Services` | PASS |
| `url` | Required | `https://shalean.co.za` | PASS (slash style PARTIAL) |
| `alternateName` | Recommended | **Absent** | GAP — primary remediation lever when preferred name not selected |

### Validation notes

- JSON parses cleanly (PowerShell `ConvertFrom-Json`) — **no malformed JSON**.
- Duplicate `@id` values within the homepage graph: **none observed**.
- Name conflicts on homepage primary entities: **none** (all business nodes use preferred name).
- Cross-page inconsistency: About page nested `WebSite.name` = `Shalean` while homepage Website uses full preferred name (**RC-6 / Low**).
- Logo file `https://shalean.co.za/images/shalean-logo.png` returns **200**, but is **not** referenced as LocalBusiness/`Organization` `logo`.
- Schema describes Shalean on `shalean.co.za` — **no wrong-brand / wrong-domain schema** on homepage.
- Authoritative references: [Google site names](https://developers.google.com/search/docs/appearance/site-names), [Schema.org WebSite](https://schema.org/WebSite).

**Important:** Adding `alternateName` or other schema does **not guarantee** Google will change the displayed site name.

---

## 10. Canonical and Indexability Assessment

| Check | Result |
|-------|--------|
| Single apex canonical homepage | **Yes** — www redirects to apex |
| HTTP → HTTPS | **Yes** (308) |
| www consistency | **Yes** (307 to apex) |
| Trailing slash | Both `/` and no-slash return 200; canonical omits slash; sitemap includes slash |
| Query variants | Canonical remains apex |
| Staging / Vercel URL as canonical | **Not observed** in homepage head |
| Sitemap homepage | `https://shalean.co.za/` present, priority 1 |
| robots.txt | `Allow: /` for homepage; many money paths Disallow (separate SEO topic) |
| Homepage indexable | `index, follow` present; no `noindex` |
| Canonical server-rendered | Yes |
| Redirect loops | Not observed |
| Soft duplicate | **`/index` serves identical homepage** with same canonical |
| Live SEO script | `npm run validate:live-seo` → **OK** (41 sitemap URLs; canonicals aligned) |

---

## 11. Brand Consistency Assessment

| Observed string | Classification | Where |
|-----------------|----------------|-------|
| `Shalean Cleaning Services` | Approved preferred name | OG site name, WebSite/LocalBusiness/CleaningService, logo alt, footer copyright, manifest `name`, privacy/terms, social titles |
| `Shalean` | Approved short name | Homepage `<title>` suffix, many CTR title helpers (`metaTitle.ts` default brandSuffix), About nested WebSite, manifest `short_name` |
| `shalean.co.za` | Domain fallback | Google site-name display (SERP); not used as `WebSite.name` in repo/live |
| Keyword H1 without legal name | Not conflicting, but weak entity text signal | Hero H1 |

**Assessment:** The preferred legal/business name is well represented in schema and OG. Visible primary text (H1 + title brand token) emphasizes **service keywords + short brand `Shalean`**. That is coherent for CTR, but Google’s site-name system may treat confidence in the longer preferred name as weaker when alternateName is absent — and then fall back to the domain rather than `Shalean`.

No recommendation to keyword-stuff H1 with the legal name.

---

## 12. External Entity Signal Assessment

| Source | Displayed name | Website URL | Points to apex? | Verification level | Consistency |
|--------|----------------|-------------|-----------------|--------------------|-------------|
| Facebook (`facebook.com/shaleancleaning/`) | Title includes `Shalean Cleaning Services \| Cape Town` | Not fully parsed beyond title | Assumed / public page exists | Public fetch only | Aligns with preferred name |
| Instagram (`@shalean_cleaning_services`) | Title includes `Shalean Cleaning Services` | N/A | Profile naming OK | Public fetch only | Aligns |
| LinkedIn | Env-capable via `NEXT_PUBLIC_BRAND_LINKEDIN_URL` | Unknown if set in prod beyond sameAs absence | — | **NOT VERIFIED** | Live sameAs had FB+IG only |
| Google Business Profile | Unknown | Env URL may exist | Unknown | **NOT VERIFIED** | — |
| Google Search Console | Indexing / site-name processing unknown | — | — | **NOT VERIFIED** | — |
| X / other listings | Not inspected with authenticated access | — | — | **NOT VERIFIED** | — |

No external profiles were edited. No accounts were created. No indexing requests were submitted.

---

## 13. Findings and Root Causes

### F-001 — Missing `WebSite.alternateName` on homepage

| Field | Value |
|-------|-------|
| Severity | **Medium** |
| Evidence | Live WebSite node keys: `@type`, `@id`, `url`, `name`, `inLanguage`, `publisher` only; repo `buildWebSiteJsonLdNode` omits `alternateName` |
| Affected | `apps/web/lib/seo/schemaGraph.ts`; live `https://shalean.co.za/` |
| Root cause | **RC-1** Missing technical signal (recommended) |
| Impact | When Google rejects/low-confidences preferred name, docs say it **strongly considers** `alternateName`; without it, domain fallback is more likely |
| Confidence | **High** (signal absence verified); causal link to SERP **Medium** (Google discretionary) |
| Treatment | Add `alternateName: ["Shalean"]` (optionally include lowercase domain last) in a later authorized change |
| Owner | SEO Engineering + Engineering |

### F-002 — Google displaying domain despite valid preferred `WebSite.name`

| Field | Value |
|-------|-------|
| Severity | **Medium** (SERP branding; not an indexing/security outage) |
| Evidence | Reported SERP site name `shalean.co.za`; live `WebSite.name` preferred name present |
| Affected | SERP appearance for site |
| Root cause | **RC-9** Google processing delay or discretionary rewrite (+ contributes **RC-1**) |
| Impact | Weaker brand recognition in SERP chrome; title link still branded short-name |
| Confidence | **Medium-High** for classification; exact Google internal reason **NOT VERIFIED** |
| Treatment | Strengthen signals per Google ladder; request recrawl after approved change; wait days–weeks |
| Owner | SEO Engineering; Executive for external actions |

### F-003 — Homepage title uses short brand only

| Field | Value |
|-------|-------|
| Severity | **Low** |
| Evidence | `HOME_PAGE_TITLE` = `… \| Shalean`; matches live title and reported SERP title |
| Affected | `apps/web/lib/seo/homePageMeta.ts` |
| Root cause | **RC-6** Brand naming inconsistency (short vs preferred across site-name-relevant surfaces) |
| Impact | Supports short-name recognition more than full preferred name in `<title>` |
| Confidence | **High** |
| Treatment | Optional: keep short brand in titles for CTR; rely on `WebSite.name` + `og:site_name` + `alternateName` for site name — do not conflate title rewrite with site-name fix |
| Owner | Marketing/Brand + SEO Engineering |

### F-004 — Soft duplicate homepage at `/index`

| Field | Value |
|-------|-------|
| Severity | **Low** |
| Evidence | `/index` → 200, same title/length as `/`; canonical points to apex |
| Affected | Production URL space |
| Root cause | **RC-5** Canonical/duplicate URL hygiene gap (canonical mitigates) |
| Impact | Extra URL for crawlers; canonical reduces risk |
| Confidence | **High** |
| Treatment | Later: 301 `/index` → `/` if approved |
| Owner | Engineering |

### F-005 — Sitemap vs canonical trailing-slash mismatch

| Field | Value |
|-------|-------|
| Severity | **Informational** |
| Evidence | Sitemap loc `https://shalean.co.za/`; canonical `https://shalean.co.za` |
| Root cause | **RC-3** Minor conflicting implementation detail |
| Impact | Unlikely sole cause of domain site name; pathname-level live SEO check passed |
| Confidence | **High** |
| Treatment | Normalize slash policy in metadata/sitemap in a later change |
| Owner | Engineering / SEO Engineering |

### F-006 — LocalBusiness lacks `logo` property

| Field | Value |
|-------|-------|
| Severity | **Low** |
| Evidence | Live LocalBusiness has `image` array; logo PNG 200 OK but unused in schema |
| Root cause | **RC-1** Missing technical signal (entity completeness) |
| Impact | Secondary for site name; more relevant to knowledge/entity clarity |
| Confidence | **High** |
| Treatment | Optional `logo` ImageObject pointing at `/images/shalean-logo.png` |
| Owner | SEO Engineering |

### F-007 — About page nested WebSite name uses short brand

| Field | Value |
|-------|-------|
| Severity | **Low** |
| Evidence | `AboutPageView.tsx` `isPartOf: { "@type": "WebSite", name: "Shalean", ...}` |
| Root cause | **RC-6** / **RC-3** |
| Impact | Non-homepage; Google site name primarily from domain homepage — limited direct impact |
| Confidence | **High** |
| Treatment | Align nested WebSite name with preferred name / shared builder |
| Owner | Engineering |

### F-008 — Search Console / GBP evidence gap

| Field | Value |
|-------|-------|
| Severity | **Informational** |
| Evidence | No authenticated GSC/GBP access in this audit; MCP search found no GSC tools |
| Root cause | **RC-8** Evidence gap |
| Impact | Cannot confirm crawl date, inspection result, or GBP NAP consistency |
| Confidence | **High** (gap exists) |
| Treatment | Read-only GSC URL Inspection + GBP name/URL review in a later authorized ops session |
| Owner | SEO Engineering / Marketing |

### F-009 — JSON-LD served from Suspense deferred slot

| Field | Value |
|-------|-------|
| Severity | **Informational** |
| Evidence | Script lives under `<div hidden id="S:0">` in streamed HTML; still present in raw response |
| Root cause | **RC-10** / architecture note — not proven harmful |
| Impact | Unlikely for Googlebot if full HTML is fetched; theoretically weaker for naive parsers |
| Confidence | **Medium** |
| Treatment | Optional future move of WebSite-only JSON-LD into head/static shell for earlier discovery |
| Owner | Engineering |

---

## 14. Options and Recommendation

### Option A — Do nothing technical; monitor only

- Pros: Zero change risk  
- Cons: Leaves missing recommended `alternateName`; domain display may persist indefinitely  

### Option B — Smallest schema hardening (recommended)

1. Add `alternateName` to shared `buildWebSiteJsonLdNode` (preferred order: `Shalean`, optionally `shalean.co.za` last).  
2. Keep `name: "Shalean Cleaning Services"`.  
3. Do **not** set `name` to the domain (Google last-resort workaround — avoid unless all else fails).  
4. Optionally add LocalBusiness `logo`.  
5. Align About nested WebSite name to the shared builder.  
6. After deploy: GSC URL Inspection + recrawl request; wait days–weeks.

### Option C — Broader brand/title rewrite

- Change homepage title brand to full preferred name.  
- Pros: Stronger on-page string consistency.  
- Cons: Title length/CTR tradeoffs; **not required** by Google as the primary site-name lever; Marketing must approve.

### Option D — External entity alignment

- Verify GBP name/URL and GSC property after Option B.  
- Only with explicit external authorization.

**Recommendation:** **Option B** as the smallest safe remediation scope after authorization. Treat Option C/D as follow-ons if site name remains the domain after recrawl/processing time.

---

## 15. Risk and Change-Control Assessment

| Risk | Level | Notes |
|------|-------|-------|
| SERP site-name still domain after fix | Medium | Google discretionary; no guarantee |
| Breaking JSON-LD / rich results | Low if change is additive `alternateName` only |
| Title CTR regression | Medium if Option C pursued without review |
| Production incident from docs-only phase | None |
| Unauthorized external edits | Avoided in this phase |

Change control: any implementation requires explicit **REMEDIATION AUTHORIZATION** and standard engineering PR + production release gates. External GSC/GBP actions require **EXTERNAL PLATFORM CHANGE AUTHORIZATION**.

---

## 16. Proposed Remediation Plan

**Status:** Proposed only — **NOT AUTHORIZED**

1. **Phase 0 — Approval**  
   - SEO Engineering + Marketing confirm preferred name / short name / whether domain may appear in `alternateName`.  
   - Executive/engineering release approval for production deploy.

2. **Phase 1 — Minimal code** (single PR preferred)  
   - Update `buildWebSiteJsonLdNode` in `schemaGraph.ts` to emit `alternateName`.  
   - Add/extend unit test asserting homepage Website node fields.  
   - Optional: LocalBusiness `logo`; About page alignment; `/index` → `/` redirect.

3. **Phase 2 — Staging verification**  
   - Confirm raw HTML JSON-LD on staging/preview.  
   - Schema Markup Validator (syntax).  
   - No Rich Results Test expectation for site names (unsupported per Google).

4. **Phase 3 — Production release**  
   - Deploy via normal release process.  
   - Re-fetch production homepage; confirm `alternateName` present.

5. **Phase 4 — Indexing ops (separate auth)**  
   - GSC URL Inspection on homepage; request indexing if needed.  
   - Re-check SERP over 3–21+ days.

---

## 17. Validation and Release Plan

### Pre-merge

- Unit test on `buildWebSiteJsonLdNode`  
- Existing SEO unit tests still green  
- Preview HTML contains updated WebSite node  

### Post-deploy

- Raw fetch `https://shalean.co.za/` → parse JSON-LD  
- Confirm `og:site_name` unchanged  
- `npm run validate:live-seo`  
- Optional `LIVE_SEO_EXTENDED=1`  
- GSC inspection (authorized ops)  
- Manual SERP spot-check (incognito / multiple locales) after delay  

### Success criteria (realistic)

- Technical: preferred `name` + `alternateName` present and consistent  
- Business: Google **may** show preferred or short name; domain fallback remains possible  

---

## 18. Evidence Appendix

### A. Live WebSite node (production)

```json
{
  "@type": "WebSite",
  "@id": "https://shalean.co.za/#website",
  "url": "https://shalean.co.za",
  "name": "Shalean Cleaning Services",
  "inLanguage": "en-ZA",
  "publisher": { "@id": "https://shalean.co.za/#localbusiness" }
}
```

### B. Live head excerpts

- `<title>Cleaning Services Cape Town from R250 | Shalean</title>`
- `<meta property="og:site_name" content="Shalean Cleaning Services"/>`
- `<link rel="canonical" href="https://shalean.co.za"/>`
- `<meta name="robots" content="index, follow"/>`

### C. Authoritative citations

1. Google Search Central — [Provide a site name to Google Search](https://developers.google.com/search/docs/appearance/site-names) (required `name`/`url`; recommended `alternateName`; domain fallback behavior).  
2. Schema.org — [WebSite](https://schema.org/WebSite).  

### D. Production health snapshot (redacted)

`GET https://shalean.co.za/api/health/environment` → `status=ok`, `deployment=production`, `gitBranch=main`, Supabase ref `tchayecuvzssixyxlvfu`, Paystack live.

---

## 19. Commands Executed

All non-destructive. No installs of new dependencies. No commits/pushes/PRs/deploys.

| # | Command / action | Result |
|---|------------------|--------|
| 1 | PowerShell redirect probes for http/https www/apex `/home` `/index` | Apex HTTPS 200; www→apex; `/home` 404; `/index` 200 duplicate |
| 2 | Fetch `https://shalean.co.za/` HTML; extract title/meta/OG/JSON-LD/H1 | Signals recorded in §7–9 |
| 3 | Parse JSON-LD with `ConvertFrom-Json` | 12 graph nodes; WebSite lacks `alternateName` |
| 4 | HEAD/GET logo, OG image, manifest | All 200 |
| 5 | Public GET Facebook + Instagram profile pages | Titles include preferred business name |
| 6 | Fetch robots.txt + sitemap.xml | Homepage allowed; sitemap contains `https://shalean.co.za/` |
| 7 | `npx vitest run lib/seo/__tests__/contactPageJsonLd.test.ts lib/seo/__tests__/seoRebuildPhase1.test.ts` | 2 files / 8 tests passed |
| 8 | `npx tsx scripts/validate-live-seo.ts` (base `https://shalean.co.za`) | OK — 41 URLs, canonicals aligned |
| 9 | `GET /api/health/environment` | Production identity confirmed |
| 10 | Repo greps for Shalean / WebSite / og siteName / schema helpers | Architecture mapped in §6 |
| 11 | Production build | **Skipped** — would write build artifacts under tracked/ignored app output; not required given live HTML evidence |
| 12 | Full `eslint` / full `typecheck` | **Skipped** — unnecessary for read-only site-name evidence; focused tests run instead |
| 13 | GSC / GBP authenticated reads | **Unavailable** — marked NOT VERIFIED |

---

## 20. Assumptions, Limitations, and Unverified Items

1. Reported Google SERP snippet is accepted as accurate for this audit; live SERP HTML was not scraped from Google results pages.  
2. Google’s internal confidence score / entity graph state is unknowable here (**RC-9 / RC-10**).  
3. Search Console last crawl / inspection outcome: **NOT VERIFIED**.  
4. Google Business Profile exact name and website field: **NOT VERIFIED**.  
5. LinkedIn and other listings beyond FB/IG public titles: **NOT VERIFIED**.  
6. Whether historical schema lacked `WebSite.name` (stale index hypothesis) cannot be proven without GSC history — current production **does** emit correct `name`.  
7. Formal Marketing “approved preferred name” ratification is inferred from pervasive product usage and audit headers, not a single brand policy file.  
8. No guarantee that remediation will change the SERP site name.

---

## Audit Decision

**CONDITIONAL PASS** — core site-name technical signals (`WebSite.name`, `og:site_name`, LocalBusiness naming, apex canonical, indexable homepage) are correctly implemented and match production; Google’s domain display is most consistent with **discretionary / low-confidence selection (RC-9)**, amplified by **missing recommended `alternateName` (RC-1)** and soft brand-signal skew toward the short name in `<title>` (RC-6). Material evidence gaps remain for GSC/GBP.

- **REMEDIATION AUTHORIZATION: NOT GRANTED**  
- **PRODUCTION CHANGE AUTHORIZATION: NOT GRANTED**  
- **EXTERNAL PLATFORM CHANGE AUTHORIZATION: NOT GRANTED**  

Stop. Await explicit approval before preparing or executing remediation.
