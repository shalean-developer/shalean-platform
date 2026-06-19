/** Paths that are in-app funnel steps — not marketing landing pages for attribution. */
const BOOKING_FLOW_EXACT = new Set([
  "/details",
  "/schedule",
  "/extras",
  "/payment",
  "/cleaner",
  "/quote",
  "/checkout",
  "/booking/success",
  "/booking/recover",
  "/booking/details",
  "/booking/schedule",
  "/booking/extras",
  "/booking/payment",
  "/booking/cleaner",
  "/book/payment",
]);

const INTERNAL_PREFIXES = [
  "/admin",
  "/office",
  "/login",
  "/signup",
  "/auth",
  "/account",
  "/dashboard",
  "/api",
  "/cleaner",
  "/customer",
];

export const DIRECT_BOOKING_FLOW_LANDING = "(Direct / booking flow)";

export function normalizeLandingPath(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let path = raw.trim();
  if (!path.startsWith("/")) path = `/${path}`;
  // Drop query/hash fragments if ever present
  path = path.split("?")[0]?.split("#")[0] ?? path;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path.slice(0, 240);
}

export function acquisitionFirstTouchPath(payload: Record<string, unknown>): string | null {
  const ft = payload.acquisition_first_touch;
  if (ft && typeof ft === "object" && !Array.isArray(ft)) {
    const lp = (ft as Record<string, unknown>).landing_pathname;
    if (typeof lp === "string" && lp.trim()) return normalizeLandingPath(lp);
  }
  const slug = payload.landing_page_slug;
  if (typeof slug === "string" && slug.trim()) return normalizeLandingPath(slug);
  return null;
}

export function eventPathname(payload: Record<string, unknown>): string | null {
  const path = payload.pathname;
  if (typeof path === "string" && path.trim()) return normalizeLandingPath(path);
  return null;
}

/** True when path is a public marketing page worth listing in landing reports. */
export function isMarketingLandingPath(path: string | null | undefined): boolean {
  if (!path?.trim()) return false;
  if (path === DIRECT_BOOKING_FLOW_LANDING || path === "(no landing captured)") return false;

  const normalized = normalizeLandingPath(path);
  if (!normalized) return false;
  if (BOOKING_FLOW_EXACT.has(normalized)) return false;

  const lower = normalized.toLowerCase();
  for (const prefix of INTERNAL_PREFIXES) {
    if (lower === prefix || lower.startsWith(`${prefix}/`)) return false;
  }

  // Legacy checkout subtree (except marketing `/book` entry pages handled below)
  if (lower.startsWith("/booking/")) return false;

  // In-funnel payment step only — service entry `/book/{slug}` stays
  if (lower === "/book/payment") return false;

  return true;
}

/**
 * Pick the best landing path for a session from acquisition first-touch and/or page views.
 * Falls back to {@link DIRECT_BOOKING_FLOW_LANDING} when only funnel paths were seen.
 */
export function resolveSessionLanding(
  current: string | null,
  payload: Record<string, unknown>,
  _eventType?: string | null,
): string {
  const ft = acquisitionFirstTouchPath(payload);
  const pathname = eventPathname(payload);

  if (current && isMarketingLandingPath(current)) return current;
  if (ft && isMarketingLandingPath(ft)) return ft;
  if (pathname && isMarketingLandingPath(pathname)) return pathname;

  return DIRECT_BOOKING_FLOW_LANDING;
}

export function landingDisplayName(path: string): string {
  if (path === DIRECT_BOOKING_FLOW_LANDING) return "Direct / booking flow";
  if (path === "/" || path === "") return "Home";
  if (path === "/book") return "Book (service picker)";
  if (path.startsWith("/book/")) return "Book — " + path.slice("/book/".length).replace(/-/g, " ");
  const parts = path.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? path;
  return last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
