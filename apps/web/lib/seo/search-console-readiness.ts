/**
 * Google Search Console–oriented constants for filtering and URL hygiene.
 *
 * Recommended GSC views:
 * - Page filter prefix: `https://shalean.co.za/locations/` (use `SITE_ORIGIN` in tooling)
 * - Regex query filter example: `cleaning services in .* cape town`
 * - Compare hub templates vs blog `/blog/*` guides using secondary dimensions (page + query).
 *
 * Wire site verification via `<meta name="google-site-verification">` in root layout or DNS —
 * keep tokens out of git; use `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` only if you intentionally expose it.
 * CI probe: `npm run validate:search-console-readiness` (warns by default; set `REQUIRE_GSC_VERIFICATION=1` to fail).
 */
import { SITE_ORIGIN } from "@/lib/site/canonical";

export const SEO_LOCATION_HUB_URL_PREFIX = `${SITE_ORIGIN}/locations/`;

/** Stable analytics dimensions you can mirror in BigQuery / GA4 custom params */
export const LOCATION_PAGE_CONTENT_GROUP = "seo_location_hub";

/** Pair with `LOCATION_SEO_FEEDBACK_JSON` + `scripts/gsc-rows-to-location-feedback-json.ts` for title/description iterations. */
export const LOCATION_HUB_GSC_URL_PREFIX_LABEL = "locations_hub_pages";
