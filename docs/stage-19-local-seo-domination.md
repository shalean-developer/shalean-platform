# Stage 19 — Local SEO domination (programmatic pages)

| Field | Value |
|--------|--------|
| **Status** | In progress — registry + first programmatic routes shipped |
| **Depends on** | Booking funnel + analytics maturity ([booking-flow-redesign-prd.md](./booking-flow-redesign-prd.md) Phases 1–10, esp. measurement & session continuity) |
| **Primary funnel** | Google Search → local landing page → **pre-filled booking flow** |

---

## 1. Goal

**Own Cape Town cleaning search intent** by scaling **high-quality, differentiated** service × location pages—not thin doorway pages.

This stage is **distribution + content systems**, not a booking UX redesign. The booking flow should **inherit context** (service, area, source) via URL/query conventions and existing prefill helpers.

---

## 2. Page types to ship (inventory)

### 2.1 Service + metro (already partially built)

- **Pattern:** `/services/{service-slug}` with Cape Town–scoped slugs (e.g. `*-cape-town`).
- **Reference:** `apps/web/app/services/[service]/page.tsx`, `components/seo/SeoCapeTownServicePage.tsx`, `lib/seo/capeTownSeoPages.ts`.
- **Enhancement for Stage 19:** optional `?location=` for suburb pre-selection aligned with `initialLocationSlug`.

### 2.2 Location hubs (programmatic “cleaning in {suburb}”)

- **Patterns:** `apps/web/app/locations/[slug]/page.tsx` → `ProgrammaticLocationCleaningPage`; legacy/canonical growth routes under `apps/web/app/[city]/cleaning-services/[location]/page.tsx`.
- **Reference:** `components/seo/ProgrammaticLocationCleaningPage.tsx`, `lib/seo/locations.ts`.
- **Enhancement:** stronger **service-specific** modules (see §4) where intent is “deep clean Sea Point” vs generic home clean.

### 2.3 Intent combos (service × booking area)

**Chosen canonical pattern:** `/{intentSegment}/{bookingAreaSlug}`  
Examples: `/deep-cleaning/sea-point`, `/move-out-cleaning/claremont`, `/same-day-cleaning/cape-town`.

**Repo wiring:**

- Master matrix (editable): [`master_seo_matrix.csv`](./master_seo_matrix.csv)
- Typed registry + prefill helpers: `apps/web/lib/seo/seoPageRegistry.ts`
- Dynamic routes + metadata + JSON-LD: `apps/web/app/[city]/[suburb]/page.tsx` (Stage 19 only: `params.city` is the **intent segment** — required so Next.js does not collide with the existing `app/[city]/cleaning-services/...` tree)
- Composable sections (hero, proof, pricing hint, related links, CTAs): `apps/web/components/seo/stage19/Stage19IntentLanding.tsx`

**Airbnb exception (temporary):** Sea Point, Green Point, and Claremont keep **rich editorial** pages at `/services/airbnb-cleaning-{area}` (`AirbnbAreaServiceLanding`). They are **not** duplicated on `/airbnb-cleaning/…` until copy/schema migration is intentional. Century City and Camps Bay ship on the Stage 19 pattern first.

**Rule:** One primary URL per intent × area; expand the registry before adding routes so cannibalization stays controlled.

---

## 3. Required modules (every indexable landing)

| Module | Requirement |
|--------|----------------|
| **Unique intro** | First viewport copy varies by **service + suburb + hook** (pricing angle, property type, or urgency)—not synonym swapping alone. |
| **Suburb-specific copy** | Transit times, property mix, Airbnb density, student vs family areas—**fact-grounded** where possible. |
| **FAQs** | 4–8 questions; unique per page cluster; align with `FAQPage` JSON-LD where used (`buildDynamicLocationFaqs` pattern in location stack). |
| **Testimonials / proof** | Reuse verified stats (`getPublicReviewBannerStats`) + optional localized snippets where credible. |
| **Schema** | `LocalBusiness` / `Service` / `FAQPage` as appropriate; keep in sync with visible claims. |
| **Pricing hints** | Honest bands or “from” pricing consistent with product rules—no bait-and-switch ([PRD non-goals](./booking-flow-redesign-prd.md)). |
| **Embedded booking CTA** | Primary CTA → booking entry with **prefill** (§5). Secondary: “instant quote” variants tracked with `GrowthCtaLink` `source`. |
| **Internal links** | Nearby suburbs, related services, hub guides (blog/programmatic)—avoid orphan clusters. |

---

## 4. Prefilled booking flow (contract)

**Implementation reference:** `apps/web/lib/booking/seoBookingPrefill.ts`

- **Service:** map landing intent → `BookingServiceId` (`inferBookingServiceFromSeoSlug` or explicit registry per template).
- **Location:** `locationSlug` compatible with booking flow expectations (`locationSlugFromSeoLocationSlug` / hub row resolution).
- **Extras:** `recommendedSeoExtras(service)` or template-specific overrides.
- **Source:** set `source` (and preserve UTMs via existing acquisition merge on `trackGrowthEvent`) so `/admin/seo-attribution` and funnel reports stay truthful.

**Target UX:** one primary CTA builds something like:

`buildSeoBookingHref("details", { service, locationSlug, extras, source: "seo_deep_sea_point" })`

All new landing CTAs should use this (or extend it in one place) rather than ad-hoc query strings.

---

## 5. Measurement (must-have before scaling volume)

- **Page:** `page_view` with stable `page_type` per template (avoid reusing one generic type for all combos).
- **CTA:** `GrowthCtaLink` / growth events with **`source`** discriminant per block (hero vs mid-page vs sticky).
- **Down-funnel:** existing booking events (`booking_service_selected`, …, `booking_completed`) with session + acquisition payloads.
- **Admin:** `/admin/seo-attribution` for landing/source/service conversion; `/admin/funnel-intelligence` for operational narrative.

---

## 6. Execution phases (suggested)

1. **URL + content registry** — spreadsheet or typed config: `{ intentSlug, serviceId, locationSlug, primary_kw, canonical_path }`; ban duplicates.
2. **Template matrix** — 2–3 React layouts (metro-wide, suburb hub, service×suburb combo) parameterized by registry rows.
3. **Prefill + CTA audit** — every template uses `buildSeoBookingHref` (or successor) and passes `source`.
4. **Internal link graph** — programmatic “nearby” + service cross-links (`RelatedLinks`, hub stacks).
5. **Quality gate** — thin-page checklist (word count minimum, unique FAQ, unique intro score, Lighthouse sanity) before index toggle.
6. **Rollout** — ship clusters suburb-by-suburb or intent-by-intent; monitor Search Console + `seo-attribution` + conversion anomalies.

---

## 7. Non-goals (Stage 19)

- Claiming services Shalean does not operationalize (e.g. office cleaning) without ops sign-off.
- Mass-indexing **near-duplicate** suburb pages with only `{suburb}` swapped in boilerplate.
- Replacing Paystack or changing core booking steps (separate initiatives).

---

## 8. Success metrics

| Signal | Tooling |
|--------|---------|
| Landing → quote start rate | `seo-attribution` + funnel |
| Landing → completed booking | Same + `booking_completed` |
| Organic impressions/clicks | Search Console |
| Cannibalization / duplicate URLs | GSC + canonical audits |

---

## 9. Open decisions

1. **Canonical URL scheme** for service×suburb combos (path segment order, vs nested under `/locations/`).
2. **Office / same-day** — product scope vs SEO scope (indexable vs supporting pages only).
3. **Content sourcing** — who approves suburb-specific factual claims (ops vs generic safe copy).

---

*Stage 19 spec — aligns programmatic SEO scale with [booking-flow-redesign-prd.md](./booking-flow-redesign-prd.md) measurement and honesty constraints.*
