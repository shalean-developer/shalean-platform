# Stage 19 — Local SEO domination (programmatic pages)

| Field | Value |
|--------|--------|
| **Status** | **Legacy / redirected — NOT live-canonical** (SEO-P1A Option B provisional, 2026-07-22) |
| **Proposed location spine** | `/locations/{suburb}-cleaning-services` only — see `docs/audits/seo/SEO-P1A-*` |
| **Depends on** | Booking funnel + analytics maturity ([booking-flow-redesign-prd.md](./booking-flow-redesign-prd.md) Phases 1–10, esp. measurement & session continuity) |
| **Primary funnel (live)** | Google Search → **location hub or metro service** → pre-filled booking flow |
| **Implementation freeze** | IN FORCE — no Stage 19 re-enablement without separately approved `SEO-P1B-S19` |

---

## 0. Governance notice (P1A Option B)

Under provisional SEO-P1A Option B:

* **`/{intentSegment}/{bookingAreaSlug}` is not the canonical public URL class.**
* Those paths exist in the registry/templates but are **edge-redirected** to location hubs or metro `/services/*` (`legacyPhase1EdgeRedirects.ts` / `proxy.ts`).
* **`docs/master_seo_matrix.csv` is a historical / planning inventory**, not a live canonical sitemap.
* Do **not** treat Stage 19 rows as approved for indexation or publication without a separate change authorization.

---

## 1. Goal

**Own Cape Town cleaning search intent** with **high-quality, differentiated** local pages—not thin doorway pages.

Live proposed spine (P1A): **suburb hubs** + **metro service pages**. Stage 19 intent×suburb combos remain a **deferred architecture option**, not current canon.

---

## 2. Page types

### 2.1 Service + metro (live commercial)

- **Pattern:** `/services/{service-slug}` with Cape Town–scoped slugs (e.g. `*-cape-town`).
- **Reference:** `apps/web/app/services/[service]/page.tsx`, `components/seo/SeoCapeTownServicePage.tsx`, `lib/seo/capeTownSeoPages.ts`.

### 2.2 Location hubs (live proposed location spine)

- **Pattern:** `/locations/{suburb}-cleaning-services`.
- **Reference:** `apps/web/app/locations/[slug]/page.tsx` → `ProgrammaticLocationCleaningPage`; catalogue `lib/seo/data/location-hubs.json`.
- Legacy growth routes under `apps/web/app/[city]/cleaning-services/[location]/page.tsx` redirect Cape Town traffic to hubs.

### 2.3 Intent combos (Stage 19 — NOT live-canonical)

**Historical / deferred pattern:** `/{intentSegment}/{bookingAreaSlug}`  
Examples (redirected today): `/deep-cleaning/sea-point`, `/move-out-cleaning/claremont`, `/same-day-cleaning/cape-town`.

**Repo wiring (present but not public-canonical):**

- Planning matrix: [`master_seo_matrix.csv`](./master_seo_matrix.csv) (active vs retired/unresolved annotations)
- Typed registry: `apps/web/lib/seo/seoPageRegistry.ts`
- Dynamic routes: `apps/web/app/[city]/[suburb]/page.tsx`
- Template: `apps/web/components/seo/stage19/Stage19IntentLanding.tsx`
- **Public fate:** edge redirect → hub or `/services/*`

**Airbnb area editorials** at `/services/airbnb-cleaning-{sea-point|green-point|claremont}` are **HTTP 410** — **not active landings**. Do not list them as live matrix destinations.

**Century City:** **unresolved** — no hub in `location-hubs.json`; not part of the proposed location spine until verified local evidence supports a hub (`SEO-P1B-HUB`).

---

## 3. Required modules (if/when a landing class is re-authorized)

| Module | Requirement |
|--------|----------------|
| **Unique intro** | First viewport copy varies by **service + suburb + hook**—not synonym swapping alone. |
| **Suburb-specific copy** | Fact-grounded local evidence (P1A Condition 7 / claim register). |
| **FAQs** | 4–8 questions; unique per page cluster; align with `FAQPage` JSON-LD where used. |
| **Testimonials / proof** | Verified stats only — **no synthetic cleaner-network bands or simulated “recent booking” vignettes** (P1A Condition 4 publication freeze). |
| **Schema** | Keep in sync with visible, substantiated claims only. |
| **Pricing hints** | Must match transactional pricing source of truth after reconciliation (P1A Condition 5). |
| **Embedded booking CTA** | `buildSeoBookingHref` + `source` attribution. |
| **Internal links** | Prefer live hubs + metro services; do not promote redirected Stage 19 paths as destinations. |

---

## 4. Prefilled booking flow (contract)

**Implementation reference:** `apps/web/lib/booking/seoBookingPrefill.ts`

Still valid for **hub and metro** CTAs. Stage 19-specific CTA sources remain dormant while redirects hold.

---

## 5. Measurement

- Prefer `page_type` values for **live** templates (hubs, metro services, blog).
- Do not scale Stage 19 measurement as if those URLs were indexable owners.

---

## 6. Execution posture

1. **Baseline hubs** as sole proposed location spine (P1A).  
2. **Do not expand** Stage 19 public URLs without `SEO-P1B-S19`.  
3. **Hub expansion** (e.g. Century City) requires verified local evidence (`SEO-P1B-HUB`).  
4. **Claim / price reconciliation** before any schema or “from” price changes (`SEO-P1B-CLM`).  
5. **Split scopes** — no bulk P1B implementation (P1A Condition 9).

---

## 7. Non-goals

- Claiming services Shalean does not operationalize without ops sign-off.
- Mass-indexing near-duplicate suburb pages.
- Treating Stage 19 registry rows as live canonical owners.
- Replacing Paystack or changing core booking steps (separate initiatives).

---

## 8. Success metrics (live spine)

| Signal | Tooling |
|--------|---------|
| Hub / service → quote start | `seo-attribution` + funnel |
| Landing → completed booking | Same + `booking_completed` |
| Organic impressions/clicks | Search Console (**read-only** while GSC freeze holds) |
| Cannibalization | GSC + canonical audits when separately authorized |

---

## 9. Open decisions (require separate approval)

1. **SEO-P1B-S19** — keep redirect vs delete Stage 19 tree vs re-enable.  
2. **SEO-P1B-HUB** — Century City (and others) hub evidence standard.  
3. **SEO-P1B-CLM / SYN** — price reconciliation and synthetic-claim suppression in code.  
4. Office / same-day product scope vs SEO scope.

---

*Amended 2026-07-22 for SEO-P1A Option B: Stage 19 is not live-canonical. Controlling package: `docs/audits/seo/SEO-P1A-DECISION-PACKAGE-2026-07-22.md`.*
