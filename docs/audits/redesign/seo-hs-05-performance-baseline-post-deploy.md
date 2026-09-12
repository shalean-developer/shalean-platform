# SEO-HS-05 — Performance baseline and post-deploy TTFB/LCP verification

## Status

- Pre-deployment architecture and cache baseline: **PASS**
- Pre-deployment performance optimisation change: **NOT REQUIRED**
- Exact production TTFB/LCP verification: **PENDING POST-DEPLOYMENT**
- Production deployment or production-data mutation: **NOT PERFORMED**

## Scope

Routes:

- `/`
- `/services`

Programme branch:

- `design/rd-public-pages-normalization`

This slice records the performance evidence available before release and defines the production acceptance gate. It does not introduce speculative caching or revalidation changes.

## Pre-deployment findings

### 1. Both target pages remain static in the proposed build

The successful PR production build classifies both routes as static/prerendered:

- `○ /`
- `○ /services`

This is important for `/services`: the Optional Extras section reads the booking catalogue through `loadBookingV2Catalog()`, but that server-side read does not currently force the public services hub into per-request dynamic rendering.

Therefore there is no evidence that the Extras catalogue read is adding a database round trip to every customer request.

### 2. Current production cache behaviour is healthy

Recent Vercel production runtime logs for `main` show normal requests to both target pages returning successfully with edge/runtime cache hits:

- `GET /` → `200`, `cache=HIT`
- `GET /services` → `200`, `cache=HIT`

The release should preserve this effective cache behaviour unless a deliberate rendering change is separately approved.

### 3. Homepage LCP architecture is favourable

The homepage renders the hero before its database-backed lower sections. Those lower sections are wrapped in React `Suspense`, so they are not intended to block the primary hero composition.

The homepage hero image is explicitly preloaded and rendered with Next Image `priority` and `fetchPriority="high"`.

### 4. Services hero LCP architecture is favourable

The `/services` hero image is rendered with Next Image `priority`, `fetchPriority="high"`, and responsive `sizes`.

### 5. Extras catalogue is a build/static-generation concern, not currently a runtime TTFB concern

`ServicesBookingExtrasSection` is an async server component. It calls `loadBookingV2Catalog()` and falls back to static `SERVICE_CONFIG` extras if the live catalogue cannot be read.

When Supabase admin configuration is present, `loadBookingV2Catalog()` reads `pricing_services`, `pricing_extras`, and `pricing_booking_config` in parallel. This should be treated primarily as build/static-generation work while `/services` remains a static route.

A future requirement for fresher Extras data may justify controlled revalidation or another cache strategy, but data freshness is separate from the current performance question and should not be changed without evidence.

## Pre-deployment decision

Do **not** add a new cache wrapper, force dynamic rendering, or add revalidation solely for SEO-HS-05.

Reason:

1. `/` is static.
2. `/services` is static.
3. Current production requests for both routes are cache hits.
4. Both hero images already receive high-priority loading treatment.
5. No measured TTFB/LCP regression has been demonstrated on the proposed release.

Optimising before measurement could reduce catalogue freshness or add complexity without improving customer performance.

## Post-deployment acceptance gate

After the authorised release reaches production, verify the deployed SHA first and then measure `/` and `/services` independently.

### TTFB

Target guideline:

- **Good:** p75 at or below **800 ms**
- Investigate if materially above 800 ms or materially worse than the pre-release production baseline under comparable conditions.

Record separately:

- `/` TTFB
- `/services` TTFB
- cache status for representative production GET requests

### LCP

Core Web Vitals target:

- **Good:** p75 at or below **2.5 s**

Record separately for mobile and desktop where available:

- `/` LCP
- `/services` LCP

Also confirm the release does not introduce an obvious CLS or INP regression even though the primary SEO-HS-05 decision metrics are TTFB and LCP.

## Post-deployment verification procedure

1. Confirm the production deployment SHA matches the authorised release SHA.
2. Confirm `/` returns HTTP 200 and retains normal cache-hit behaviour after warm-up.
3. Confirm `/services` returns HTTP 200 and retains normal cache-hit behaviour after warm-up.
4. Run immediate lab checks for `/` and `/services` on mobile and desktop.
5. Record available field/CrUX data when sufficient post-release data exists; field data will lag the deployment.
6. Compare TTFB and LCP with the acceptance thresholds and any comparable pre-release production measurements.
7. If `/services` TTFB is poor, first verify whether the route has unexpectedly become dynamic or lost edge caching before changing catalogue code.
8. If LCP is poor, inspect the hero-image request, responsive image size, render delay, font/layout work, and main-thread blocking before changing server caching.
9. Add catalogue caching/revalidation only if measured evidence shows the Extras path materially contributes to the regression.

## Closure criteria

SEO-HS-05 may be marked **Completed** only when:

- the release is in production;
- the exact production SHA is verified;
- `/` and `/services` are both healthy 200 responses;
- representative cache behaviour is recorded;
- TTFB is measured for both routes;
- LCP is measured for both routes, preferably mobile and desktop;
- any threshold breach has a documented diagnosis and approved remediation plan;
- no speculative caching change is introduced without evidence.

Until then, the correct status is:

**Pre-deployment baseline complete; post-deployment performance verification pending.**
