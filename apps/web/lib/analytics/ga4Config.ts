/**
 * Canonical GA4 web stream for https://shalean.co.za (apex).
 *
 * Live gtag/js previously loaded legacy `G-6JR2GPGPN3` (Google tag / www-linked).
 * Collect hits on the apex host resolve to `G-GEVTBDWTQW` — keep only that Measurement ID
 * in app code and env. Do **not** delete the old GA4 stream in Admin; just stop sending to it.
 */
export const GA4_CANONICAL_MEASUREMENT_ID = "G-GEVTBDWTQW";

/** Legacy / www-linked IDs — must never be configured as the active public tag. */
export const GA4_LEGACY_MEASUREMENT_IDS = ["G-6JR2GPGPN3"] as const;

/** Fixed branch dimension for Cape Town funnel / purchase events. */
export const GA4_BRANCH = "cape-town";

/**
 * Public GA4 must not initialise or send on these app surfaces (and their subpaths).
 */
export const GA4_EXCLUDED_PATH_PREFIXES = ["/office", "/cleaner", "/jobs"] as const;

/** Public recruitment paths under `/cleaner` that must still receive GA4. */
export const GA4_CLEANER_PUBLIC_PATH_PREFIXES = ["/cleaner/apply"] as const;

export function getGa4MeasurementId(): string {
  const fromEnv =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()) ||
    (typeof process !== "undefined" && process.env.GA4_MEASUREMENT_ID?.trim()) ||
    "";
  if (fromEnv && (GA4_LEGACY_MEASUREMENT_IDS as readonly string[]).includes(fromEnv)) {
    return GA4_CANONICAL_MEASUREMENT_ID;
  }
  return fromEnv || GA4_CANONICAL_MEASUREMENT_ID;
}

/** True when pathname is an internal surface that must not receive GA4. */
export function isGa4PathExcluded(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.split("?")[0]?.split("#")[0] || "";
  // Careers / cleaner application is a public marketing funnel (see CleanerRouteShell).
  if (
    GA4_CLEANER_PUBLIC_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
  ) {
    return false;
  }
  return GA4_EXCLUDED_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Compact path-exclusion snippet for injected scripts (hard navigations / first paint).
 * Matches `/office`, `/cleaner`, `/jobs` and subpaths, but not `/cleaner/apply`.
 */
/**
 * Returns the GA4 config options object. Includes `debug_mode: true` when
 * `NEXT_PUBLIC_GA4_DEBUG_MODE` is "true" or "1" (staging only).
 * Used by both the SSR inline bootstrap (`GoogleAnalytics`) and the client
 * SPA bootstrap (`Ga4RouteGuard`).
 */
export function getGa4ConfigOptions(): Record<string, unknown> {
  const debugMode =
    process.env.NEXT_PUBLIC_GA4_DEBUG_MODE === "true" ||
    process.env.NEXT_PUBLIC_GA4_DEBUG_MODE === "1";
  const opts: Record<string, unknown> = {
    send_page_view: true,
    allow_enhanced_conversions: false,
  };
  if (debugMode) opts.debug_mode = true;
  return opts;
}

/**
 * Serialised config options for use inside inline `<script>` tags.
 * Returns a JS object literal string like `{send_page_view:true,...}`.
 */
export function getGa4ConfigOptionsLiteral(): string {
  const debugMode =
    process.env.NEXT_PUBLIC_GA4_DEBUG_MODE === "true" ||
    process.env.NEXT_PUBLIC_GA4_DEBUG_MODE === "1";
  return debugMode
    ? "{send_page_view:true,allow_enhanced_conversions:false,debug_mode:true}"
    : "{send_page_view:true,allow_enhanced_conversions:false}";
}

export const GA4_PATH_EXCLUSION_SNIPPET =
  'var __ga4p=(location.pathname||"").split("?")[0];if(/^\\/(office|jobs)(\\/|$)/.test(__ga4p)||(/^\\/cleaner(\\/|$)/.test(__ga4p)&&!/^\\/cleaner\\/apply(\\/|$)/.test(__ga4p)))return;';
