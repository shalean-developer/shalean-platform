# SEO-P1A — Complete Evidence Matrices

| Field | Value |
|-------|-------|
| Document ID | `SEO-P1A-EVIDENCE-MATRICES-2026-07-22` |
| Date | 2026-07-22 |
| Amended | 2026-07-22 — Option B conditions 1–10 |
| Mode | **Repo-only** (no production / GSC / Plesk / analytics writes) |
| Control | `docs/audits/seo/SEO-P1A-CONTROL-2026-07-22.md` |
| Status | **OPTION B provisional baseline — stop before implementation** |

### Option B amendments (summary)

| Cond | Matrix impact |
|------|----------------|
| 1 | LOC-A = **sole proposed location spine** |
| 2 | LOC-E / Stage 19 = **not canonical** (docs corrected) |
| 3 | City phrase → `/`; catalogue → `/services` (D1 superseded) |
| 4 | EV-12 / EV-14 / CL-14 = **publication freeze** |
| 5 | CL-02–CL-04 = reconcile to transactional pricing SoT before ship |
| 6 | LOC-G / Airbnb 410 = **not active landing matrix** |
| 7 | Century City = **unresolved**; out of proposed architecture |
| 8 | Blog consolidation = evidence-led winner only |
| 9 | P1B split scopes only |
| 10 | All freezes including GSC |

---

## Matrix A — Location architectures

### A1. Systems inventory

| ID | System | URL pattern (example) | Route / template | Generation | Data source | Index / edge behaviour (repo) | Evidence class |
|----|--------|----------------------|------------------|------------|-------------|-------------------------------|----------------|
| LOC-A | **Suburb hubs (sole proposed location spine)** | `/locations/sea-point-cleaning-services` | `apps/web/app/locations/[slug]/page.tsx` → `ProgrammaticLocationCleaningPage` | SSG (`generateStaticParams`, `dynamicParams=false`) | `lib/seo/data/location-hubs.json` (23) + editorial `LOCATION_SEO_PAGES` in `capeTownSeoPages.ts` | Live when `SEO_REBUILD_PHASE >= 2` (currently **2**); sitemap via `buildMarketingSitemapEntries` | Repo fact + **proposed canon** |
| LOC-B | Locations index | `/locations` | `app/locations/page.tsx` | Static | Hub catalogue | Indexable directory | Repo fact |
| LOC-C | Areas we serve | `/areas-we-serve` | `app/(marketing)/areas-we-serve/page.tsx` | Static | `CAPE_TOWN_LOCATIONS` | Links into hubs | Repo fact |
| LOC-D | Legacy growth city×area | `/cape-town/cleaning-services/sea-point` | `app/[city]/cleaning-services/[location]/page.tsx` | SSG from `SERVICE_LOCATIONS` / `lib/locations.ts` (~17 incl. JHB stubs) | Static `LOCATIONS[]` | CT → permanent redirect to hub; non-CT `noindex` / retired paths | Repo fact |
| LOC-E | Stage 19 intent×suburb (**NOT canonical**) | `/deep-cleaning/sea-point` | `app/[city]/[suburb]/page.tsx` → `Stage19IntentLanding` | SSG from `SEO_STAGE19_REGISTRY` | `seoPageRegistry.ts` + planning CSV | **Edge redirects** → hub or `/services/*`; docs must not call these canonical | Repo fact + **Condition 2** |
| LOC-F | Metro service pages | `/services/deep-cleaning-cape-town` | `app/services/[service]/page.tsx` → `SeoCapeTownServicePage` | SSG | `CAPE_TOWN_SEO_SERVICE_SLUGS` (7) + blocks in `capeTownSeoPages.ts` | Core sitemap paths | Repo fact |
| LOC-G | Airbnb area editorials (**not active landings**) | `/services/airbnb-cleaning-sea-point` | Dedicated service routes → `AirbnbAreaServiceLanding` | Static | `lib/seo/airbnbAreaLandingPages.ts` | **HTTP 410**; removed from active landing matrices (Condition 6) | Repo fact + **retired_410** |
| LOC-H | City commercial hub (legacy) | `/cleaning-services-cape-town` | `app/(marketing)/cleaning-services-cape-town/page.tsx` | Static | Component pack under `components/locations/cape-town-cleaning-services/` | Redirects away; **superseded** as city-phrase owner (Condition 3 → `/`) | Repo fact + superseded |
| LOC-I | Hub alias | `/locations/cape-town-cleaning-services` | Dedicated page | Redirect | — | `permanentRedirect` → `/locations` | Repo fact |
| LOC-J | Blog local / programmatic guides | `/blog/{slug}` | `app/blog/[slug]/page.tsx` + programmatic/local-guide templates | DB CMS + TS pools | Supabase `blog_posts` + `programmaticPosts.ts` / seeds | Bidirectional links; many legacy area blogs 301 → hubs | Repo fact |
| LOC-K | Booking ops locations | (booking UI / eligibility) | Booking flow | Dynamic | DB `locations` + booking catalogues | **Broader suburb set** than SEO hubs; marketing links only when hub exists | Repo fact |

### A2. Canonical suburb hub catalogue (23)

Source: `apps/web/lib/seo/data/location-hubs.json`

| Slug | Name | Region | Type | Pricing band |
|------|------|--------|------|--------------|
| bantry-bay-cleaning-services | Bantry Bay | Atlantic Seaboard | coastal | atlantic_premium |
| bergvliet-cleaning-services | Bergvliet | Southern Suburbs | suburban | southern_standard |
| camps-bay-cleaning-services | Camps Bay | Atlantic Seaboard | coastal | atlantic_premium |
| claremont-cleaning-services | Claremont | Southern Suburbs | suburban | southern_standard |
| fresnaye-cleaning-services | Fresnaye | Atlantic Seaboard | coastal | atlantic_premium |
| gardens-cleaning-services | Gardens | City Bowl | urban | city_bowl |
| green-point-cleaning-services | Green Point | Atlantic Seaboard | coastal | atlantic_premium |
| kenilworth-cleaning-services | Kenilworth | Southern Suburbs | suburban | southern_standard |
| newlands-cleaning-services | Newlands | Southern Suburbs | suburban | southern_standard |
| observatory-cleaning-services | Observatory | Southern Suburbs | suburban | southern_standard |
| plumstead-cleaning-services | Plumstead | Southern Suburbs | suburban | southern_standard |
| rondebosch-cleaning-services | Rondebosch | Southern Suburbs | suburban | southern_standard |
| rosebank-cleaning-services | Rosebank | Southern Suburbs | suburban | southern_standard |
| sea-point-cleaning-services | Sea Point | Atlantic Seaboard | coastal | atlantic_premium |
| tamboerskloof-cleaning-services | Tamboerskloof | City Bowl | urban | city_bowl |
| vredehoek-cleaning-services | Vredehoek | City Bowl | urban | city_bowl |
| woodstock-cleaning-services | Woodstock | City Bowl | urban | city_bowl |
| wynberg-cleaning-services | Wynberg | Southern Suburbs | suburban | southern_standard |
| zonnebloem-cleaning-services | Zonnebloem | City Bowl | urban | city_bowl |
| constantia-cleaning-services | Constantia | Southern Suburbs | estate | estate_premium |
| table-view-cleaning-services | Table View | Blouberg | blouberg | blouberg_coastal |
| durbanville-cleaning-services | Durbanville | Northern Suburbs | northern | northern_standard |
| bellville-cleaning-services | Bellville | Northern Suburbs | northern | northern_standard |

Hub row fields (catalogue): `slug`, `name`, `city`, `region`, `nearby`, `uniqueContextLine`, `locationType`, `propertyTypes`, `pricingBand`, `serviceDemandProfile?`, `localizedFaq?`

### A3. Metro service catalogue (7)

Source: `CAPE_TOWN_SEO_SERVICE_SLUGS` in `capeTownSeoPages.ts`

| Service slug | Path |
|--------------|------|
| deep-cleaning-cape-town | `/services/deep-cleaning-cape-town` |
| standard-cleaning-cape-town | `/services/standard-cleaning-cape-town` |
| move-out-cleaning-cape-town | `/services/move-out-cleaning-cape-town` |
| office-cleaning-cape-town | `/services/office-cleaning-cape-town` |
| airbnb-cleaning-cape-town | `/services/airbnb-cleaning-cape-town` |
| carpet-cleaning-cape-town | `/services/carpet-cleaning-cape-town` |
| window-cleaning-cape-town | `/services/window-cleaning-cape-town` |

### A4. Stage 19 registry vs edge reality (not proposed canon)

Registry: `SEO_STAGE19_REGISTRY` remains in code (**23 rows**) but is **not** the proposed public architecture under Option B.

| Intent segment | Code registry | Option B public owner | Live URL fate (edge) |
|----------------|---------------|----------------------|----------------------|
| deep-cleaning | P0 rows incl. Century City | Matching **hub** where catalogue exists | Redirect → hub / service |
| move-out-cleaning | same | Matching **hub** | same |
| airbnb-cleaning | partial rows | Metro Airbnb service / hub — **not** 410 area URLs | Stage 19 redirect; area editorials **410** (inactive) |
| same-day-cleaning | suburbs + metro | Hub or metro standard service; city phrase → `/` | Redirect |
| office-cleaning | P1 rows | Metro `/services/office-cleaning-cape-town` until product/SEO scope decided | Redirect |

**Finding A-F1 (closed by Condition 2):** Stage 19 must not be documented as canonical. Docs + planning CSV amended; code tree disposition deferred to `SEO-P1B-S19`.

**Finding A-F2 (Condition 7):** Century City remains in code registry but is **UNRESOLVED** — **removed from proposed architecture** until verified local evidence supports a hub (`SEO-P1B-HUB`).

---

## Matrix B — Overlapping systems & cannibalization surfaces

| ID | Overlap pair | Nature | Control in repo today | Risk if left unresolved |
|----|--------------|--------|----------------------|-------------------------|
| OV-01 | Hubs ↔ growth `/{city}/cleaning-services/{area}` | Parallel routes | CT 301 → hub | Low if redirects stay; residual crawl confusion if chains break |
| OV-02 | Hubs ↔ Stage 19 `/{intent}/{suburb}` | Parallel commercial intent | Edge redirect; **Condition 2** docs no longer call Stage 19 canonical | Residual code-tree drift until `SEO-P1B-S19` |
| OV-03 | Airbnb editorial (410) vs active matrices | False “active landing” listing | **Condition 6** — removed from active landing matrices | SERP residue if externals still cite 410 URLs |
| OV-04 | City phrase ownership | Stale map → `/cleaning-services-cape-town` | **Condition 3** proposed: `/` city phrase; `/services` catalogue | Code map update deferred to `SEO-P1B-OWN` |
| OV-05 | Blog local guides ↔ hubs | Informational vs commercial local | Cleanup redirects + hub link helpers | Medium if CMS republishes thin clones |
| OV-06 | Blog pricing education ↔ `/services` pricing authority | Pricing intent | `PRICING_HUB_LINKING_GOVERNANCE` + warn on booking-confidence | Medium; warn-only |
| OV-07 | Blog peer posts within semantic cluster | Near-duplicate intent | `blog-cluster-collision.ts` **warn-only** | Medium editorial cannibalization |
| OV-08 | Hub FAQ / PAA ↔ `/faq` ↔ service FAQs | FAQ intent fragments | Page-local only; no cross-surface owner map | Unowned FAQ intent collisions |
| OV-09 | Money-page `areaServed` (subset) ↔ full hub catalogue | Schema coverage mismatch | Hardcoded Place list in `primaryLocalBusinessJsonLd.ts` | Incomplete entity/area signal |
| OV-10 | JHB growth stubs ↔ permanent 410 `/johannesburg/*` | Dead metro | 410 in rebuild rules | Low if noindex/410 hold |

GSC cannibalization tooling (repo script, not executed in P1A): `apps/web/scripts/gsc-cannibalization-audit.ts` (`npm run audit:gsc-cannibalization`) — **Not verified** this session.

---

## Matrix C — Blog clusters (overlapping / governed)

### C1. Semantic cluster keys

Source: `apps/web/lib/seo/blogGovernance.ts`

| Cluster key | Status | Legacy tag | Role |
|-------------|--------|------------|------|
| service-selection | Active | `cluster-1` | Decision / scope / urgency / cadence |
| booking-confidence | Active | `cluster-2` | Prep / expectations / psychology |
| move-out-authority | Planned / seeded | — | Move-out checklist authority |
| airbnb-turnover | Planned | — | Airbnb turnover graph |
| office-cleaning | Planned | — | Office cleaning graph |

Resolution: `blog_posts.semantic_cluster` wins, else first matching collision tag (`resolveSemanticClusterKey`).

### C2. Governed seed membership (slug → cluster)

Source: `GOVERNED_SEED_SLUG_SEMANTIC_CLUSTER`

| Slug | Cluster | UI intent label |
|------|---------|-----------------|
| deep-vs-standard-cleaning-which-to-book-cape-town | service-selection | Decision |
| same-day-cleaning-cape-town | service-selection | Urgency |
| whats-included-in-deep-cleaning-cape-town | service-selection | Scope |
| how-long-does-house-cleaning-take-cape-town | service-selection | Timing |
| once-off-vs-recurring-cleaning-cape-town | service-selection | Maintenance |
| how-often-should-you-deep-clean-your-home-cape-town | service-selection | Cadence |
| how-to-prepare-home-before-cleaner-arrives-cape-town | booking-confidence | Preparation |
| what-professional-cleaners-can-and-cannot-do-cape-town | booking-confidence | Expectations |
| why-home-still-feels-dirty-after-cleaning-cape-town | booking-confidence | Psychology |
| move-out-cleaning-checklist-cape-town-tenants | move-out-authority | Checklist |

**Note:** Additional labels exist in `cluster-guide-intent-labels.ts` for slugs not in the seed map (e.g. `what-does-professional-cleaner-do-cape-town`) — potential label/cluster drift.

### C3. Collision detection

| Mechanism | File | Enforcement | Signals |
|-----------|------|-------------|---------|
| Peer semantic overlap | `lib/blog/seo/blog-cluster-collision.ts` | **Warn-only** (`WARN_SEMANTIC_OVERLAP_CLUSTER`) | primary_keyword multiset; slug/title Jaccard; shared intent phrases |
| Booking-confidence × pricing hub | `publish-validation.ts` + governance | **Warn-only** | `WARN_BOOKING_CONFIDENCE_PRICING_HUB` |
| Admin preview | `GET /api/admin/blog/cluster-peers` | UI hints in `PostEditorForm` | Peer list for editors |
| Tests | `blog-cluster-collision.test.ts`, `blogGovernance.test.ts`, `publish-validation.test.ts` | CI unit coverage | Heuristics only |

**Finding C-F1:** No automated cross-surface detector (blog ↔ location hub ↔ service ↔ FAQ). Overlap control is **intra-cluster blog** + static maps.

**Condition 8:** No blog cluster consolidation without **evidence-led winner selection** (search demand, GSC/query evidence when authorized, conversion, uniqueness). Warn-only peer tooling is not sufficient authority to merge.

### C4. Blog delivery ownership (not search-intent ownership)

Source: `getBlogRouteOwnership()` in `validBlogRoutes.ts`

| Ownership type | Meaning |
|----------------|---------|
| REDIRECT_ALIAS | Legacy slug → canonical |
| STATIC_EDITORIAL | In-repo static editorial pool |
| HC_EDITORIAL | High-conversion TS pool |
| AIRBNB_PROGRAMMATIC | Airbnb host guide pool |
| LOCATION_PROGRAMMATIC | Location/programmatic pool |
| DATABASE_DYNAMIC | CMS/DB post |

---

## Matrix D — Search-intent ownership

### D1. Keyword / city-intent ownership

#### D1a. Code map (stale — superseded for baselining)

Source: `apps/web/lib/seo/keyword-primary-route.ts` (still in repo; **not updated in P1A** — freeze / Condition 3 deferred code ship to `SEO-P1B-OWN`).

| Keyword | Code map URL (stale where noted) |
|---------|----------------------------------|
| cleaning services cape town | `/cleaning-services-cape-town` — **SUPERSEDED** |
| cleaning services claremont | `/locations/claremont-cleaning-services` |
| deep cleaning cape town | `/services/deep-cleaning-cape-town` |
| standard cleaning cape town | `/services/standard-cleaning-cape-town` |
| move out cleaning cape town | `/services/move-out-cleaning-cape-town` |
| cleaning prices cape town | `/blog/how-much-does-cleaning-cost-cape-town-2026` |
| airbnb cleaning cape town | `/services/airbnb-cleaning-cape-town` |

#### D1b. Option B proposed ownership (documentary)

| Intent | Proposed owner | Condition |
|--------|----------------|-----------|
| “cleaning services Cape Town” (city phrase) | **`/`** | 3 |
| Service comparison / catalogue | **`/services`** | 3 |
| Local suburb commercial | `/locations/{suburb}-cleaning-services` | 1 |
| Metro service commercial | `/services/{service}-cape-town` | — |
| Stage 19 `/{intent}/{suburb}` | **None (not an owner)** | 2 |

### D2. Commercial intent×area (effective under Option B)

| Intent × area class | Proposed / effective owner | Not an active landing |
|---------------------|---------------------------|------------------------|
| deep / move-out / same-day × catalogued suburb | Matching **hub** | Stage 19 path |
| airbnb × sea/green/claremont area URLs | — | **410** (Condition 6) |
| airbnb metro | `/services/airbnb-cleaning-cape-town` | Stage 19 / 410 area |
| office × suburb | Metro office service until scoped | Stage 19 path |
| any × Century City | **None proposed** | Unresolved (Condition 7) |

**Finding D-F1 (addressed):** Proposed canon = hubs + metro + `/` city phrase + `/services` catalogue. Stage 19 is not an owner.

### D3. Pricing intent split

| Intent | Authority surface | Education surface | Governance |
|--------|-------------------|-------------------|------------|
| Commercial pricing / book | `/services` (`CAPE_TOWN_PRICING_AUTHORITY_HREF`) | — | `internalLinks.ts` |
| Informational cost | — | `/blog/how-much-does-cleaning-cost-cape-town-2026` | `PRICING_HUB_LINKING_GOVERNANCE` |

### D4. Blog `search_intent` field

CMS field values: `informational | transactional | commercial | navigational` (`normalizeSearchIntent` in `auto-seo.ts`).  
This is **intent type classification**, not URL ownership.

### D5. Ownership coverage gaps

| Gap | Detail |
|-----|--------|
| No FAQ owner map | FAQs are page-local only |
| Keyword map incomplete | Only 7 keywords; no suburb×service grid |
| Keyword map not enforced | No importer / CI consumer |
| Century City | **UNRESOLVED (Condition 7)** — out of proposed architecture until hub evidence |
| Keyword city phrase | Code map still stale until `SEO-P1B-OWN`; documentary owner is `/` |
| Office cleaning P1 | Prefer metro office service; Stage 19 rows not proposed canon |

---

## Matrix E — Local evidence (stored / rendered)

| ID | Evidence type | Source path | Fields / mechanism | Veracity class |
|----|---------------|-------------|--------------------|----------------|
| EV-01 | Google aggregate rating | `lib/seo/googleReviews.ts` | `rating: 4.8`, `count: 129`; `googleBusinessAggregateRatingSchema()` | **Hardcoded constants** (comment: upgrade via Places API / CMS) — live GBP sync **Not verified** |
| EV-02 | Booking review banner stats | `lib/home/reviewBannerStats.ts` → RPC `public_review_banner_stats` | `avgRating`, `reviewCount` | DB-backed when available — **Not verified** live |
| EV-03 | Area marketing review snippets | `lib/seo/location-hub-marketing-reviews.ts` → RPC `public_marketing_reviews_for_area` | excerpt, rating, suburb_label, reviewer_label | DB-backed — **Not verified** live |
| EV-04 | Trust strip copy | `LocationTrustSignals.tsx`, `location-above-fold-trust.ts` | vetted / background-checked / insured language | Marketing claim copy |
| EV-05 | Local proof bullets | `location-hub-local-proof.ts` | Derived from `locationType` / `propertyTypes` | **Generated**, not live ops metrics |
| EV-06 | Geo / micro-area facts | `location-geo-enrichment.ts` | landmarks, microAreas, roads, estates, apartmentZones, transportAccess, parkingNotes, accessNotes | Editorial geo hints |
| EV-07 | Demand profile + localized FAQ | `location-hubs.json` | `serviceDemandProfile[]`, `localizedFaq.{q,a}` | Editorial catalogue |
| EV-08 | Unique local copy | hubs JSON + `LOCATION_SEO_PAGES` | `uniqueContextLine`, intro, localAngle, ranking/featured-snippet modules | Editorial |
| EV-09 | Dynamic / PAA FAQs | `buildDynamicLocationFaqs`, `location-paa-faqs.ts` | Generated FAQ sets | Mixed editorial + template |
| EV-10 | NAP / LocalBusiness | `primaryLocalBusinessJsonLd.ts` | address Claremont `39 Harvey Rd`, `7708`; phone/email from `customerSupport`; hours `Mo-Su 08:00-18:00`; geo | First-party fact sheet (repo) |
| EV-11 | Hub schema areaServed | `structured-data.ts` / hub JSON-LD builders | Place for suburb + nearby | Template-driven |
| EV-12 | Cleaner network band | `location-hub-authority.ts` → `locationAuthorityCleanerNetworkBand` | Deterministic **hash range** from slug | **Synthetic** — **Condition 4 publication freeze** |
| EV-13 | Operating since | same file | `OPERATING_SINCE_YEAR = 2019` | Editorial constant |
| EV-14 | “Recent booking” vignettes | `buildLocationRecentBookingExamples` | Stylistic examples from geo hints | **Simulated** — **Condition 4 publication freeze** |
| EV-15 | GSC title feedback | `location-seo-feedback.ts` + GSC sync libs | Meta/title variants | Ops SEO — **Not verified** this session |

**Finding E-F1:** Location pages mix **verified-capable** signals (review RPCs, NAP) with **synthetic/stylistic** authority (cleaner bands, recent booking examples). ARE-012-class “local-page evidence standard” is not yet enforced as a gate.

---

## Matrix F — Public claims inventoriable from repo

| ID | Claim class | Example values | Defined in | Surfaces | Substantiation status (repo) |
|----|-------------|----------------|------------|----------|------------------------------|
| CL-01 | Google rating / count | 4.8 / 129 | `googleReviews.ts` | UI + JSON-LD AggregateRating | Constant; GBP live match **Not verified** |
| CL-02 | LocalBusiness priceRange | `$$ - From R280` | `primaryLocalBusinessJsonLd.ts` | Schema | **Condition 5** — reconcile to transactional SoT before any change |
| CL-03 | Hub pricing bands (meta/FAQ/hero) | atlantic `~R450–R1,200+`; city_bowl `~R380–R950+`; southern `~R400–R1,100+`; estate `~R550–R1,500+`; blouberg `~R420–R1,050+`; northern `~R380–R1,000+` | `location-pricing.ts` | Hub meta + FAQ + hero | **Condition 5** — editorial bands pending SoT reconciliation |
| CL-04 | Title / lead “from” prices | e.g. Sea Point “From R250”; service leads `~R250`–`~R800` | `capeTownSeoPages.ts`, `serviceTitleLeadPrice.ts` | Titles / service pages | **Condition 5** — R250 vs R280 vs bands |
| CL-05 | City hub pricing preview | Standard From R450, Deep R890, Move-out R1 050, Airbnb R520 | `PricingPreview.tsx` (city hub pack) | Legacy city hub UI | May be orphaned behind redirect |
| CL-06 | Airbnb area price bands | e.g. Sea Point R400–R700 / R550–R950 | `airbnbAreaLandingPages.ts` | **410 paths — not active landings** | Condition 6 |
| CL-07 | Hours | `Mo-Su 08:00-18:00` | `primaryLocalBusinessJsonLd.ts` | Schema | Known AI-ranking contradiction class vs other surfaces (baseline) — cross-surface **Not re-verified** here |
| CL-08 | NAP | 39 Harvey Rd, Claremont, 7708, ZA | `primaryLocalBusinessJsonLd.ts` | Schema / entity | Repo single source for this node |
| CL-09 | Phone / email | `CUSTOMER_SUPPORT_*` | `lib/site/customerSupport` | Schema + contact | Must stay aligned with live support |
| CL-10 | Serving areas | “Serving all Cape Town suburbs”; nearby peers; money-page Place subset | TrustBar / hubs / money-page schema | Copy + schema | Broad claim vs 23-hub catalogue |
| CL-11 | Vetted / insured / background-checked | Repeated trust language | Trust components / FAQs | Hubs, services | Legal/ops substantiation **Not in this package** |
| CL-12 | Same-day / same-week availability | Meta and Stage 19 copy | `capeTownSeoPages.ts`, Stage19 | Meta / landings | Ops capacity **Not verified** |
| CL-13 | Years in business | since 2019 / “N+ seasons” | `location-hub-authority.ts` | Hub authority section | Editorial constant |
| CL-14 | Cleaner network size | Per-hub “42–…+ vetted professionals” (hash) | `locationAuthorityCleanerNetworkBand` | Hub authority section | **Condition 4 publication freeze** |
| CL-15 | Deposit / move-out guarantee language | FAQ on move-out service | `capeTownSeoPages.ts` | Service FAQs | Legal review needed before amplification |
| CL-16 | Satisfaction guarantee | Quote/booking UI | booking/quote footers | Funnel | Out of local-hub scope but public |

**Finding F-F1 (Condition 5):** Multiple **from-price floors** coexist (R250 / R280 / band minima). Must reconcile against **transactional pricing source of truth** in a separately approved `SEO-P1B-CLM` — **no price changes in P1A**.

**Finding F-F2 (Condition 4):** Cleaner-network bands and recent-booking vignettes are **frozen from publication** (policy). Code suppress deferred to `SEO-P1B-SYN`.

---

## Matrix G — Rebuild / freeze posture (repo)

| Control | Value | File |
|---------|-------|------|
| `SEO_REBUILD_PHASE` | **2** | `seoRebuildPhase1.ts` |
| Location hub sitemap | Enabled at phase ≥ 2 | `buildMarketingSitemapEntries.ts` |
| Stage 19 in marketing sitemap collector | **Not included** | sitemap builders |
| Permanent 410 examples | `/johannesburg/*`, Airbnb area editorial paths, `/growth/local`, `/location` | `seoRebuildPhase1.ts` |
| Stage 19 public paths | Edge-resolved as legacy redirects | `legacyPhase1EdgeRedirects.ts` + `proxy.ts` |

---

## Matrix H — Option B locked answers (provisional)

| # | Topic | Locked provisional answer |
|---|-------|---------------------------|
| 1 | Location spine | **`/locations/{suburb}-cleaning-services` only** |
| 2 | Stage 19 canonicity | **Not canonical**; docs corrected; tree disposition → `SEO-P1B-S19` |
| 3 | City phrase intent | **`/`** |
| 4 | Catalogue / comparison intent | **`/services`** |
| 5 | Synthetic bands / vignettes | **Publication freeze** → `SEO-P1B-SYN` for code |
| 6 | Price floors | **Reconcile to transactional SoT** → `SEO-P1B-CLM`; no P1A edits |
| 7 | 410 Airbnb area URLs | **Not active landings** |
| 8 | Century City | **Unresolved**; out of proposed architecture |
| 9 | Blog consolidation | **Evidence-led winner only** → `SEO-P1B-BLOG` |
| 10 | P1B | **Split scopes**; no bulk implementation |
| 11 | Freezes | Production, content, redirect, analytics, **GSC** — **IN FORCE** |

---

## Evidence index (primary source files)

| Topic | Paths |
|-------|-------|
| Hubs | `apps/web/lib/seo/data/location-hubs.json`, `apps/web/lib/seo/capeTownLocations.ts`, `apps/web/app/locations/[slug]/page.tsx`, `apps/web/components/seo/ProgrammaticLocationCleaningPage.tsx` |
| Editorial SEO blocks | `apps/web/lib/seo/capeTownSeoPages.ts` |
| Stage 19 | `apps/web/lib/seo/seoPageRegistry.ts`, `docs/master_seo_matrix.csv`, `docs/stage-19-local-seo-domination.md` |
| Edge legacy | `apps/web/lib/seo/legacyPhase1EdgeRedirects.ts`, `apps/web/proxy.ts`, `apps/web/lib/seo/seoRebuildPhase1.ts` |
| Blog clusters | `apps/web/lib/seo/blogGovernance.ts`, `apps/web/lib/blog/seo/blog-cluster-collision.ts`, `apps/web/lib/blog/import/governed-seed-markdown-to-content-json.ts` |
| Intent ownership | `apps/web/lib/seo/keyword-primary-route.ts`, `apps/web/lib/seo/internalLinks.ts` |
| Claims / evidence | `apps/web/lib/seo/googleReviews.ts`, `apps/web/lib/seo/location-pricing.ts`, `apps/web/lib/seo/location-hub-authority.ts`, `apps/web/lib/seo/primaryLocalBusinessJsonLd.ts` |
| Blog governance docs | `docs/BLOG_SEO_GOVERNANCE_SUMMARY.md`, `docs/blog-routing-governance.md` |

---

**End of evidence matrices.** No implementation performed.
