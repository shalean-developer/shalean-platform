export type MarketingChannel = "google_ads" | "facebook_ads" | "organic_seo" | "direct";

export const MARKETING_CHANNELS: MarketingChannel[] = [
  "google_ads",
  "facebook_ads",
  "organic_seo",
  "direct",
];

export const MARKETING_CHANNEL_LABELS: Record<MarketingChannel, string> = {
  google_ads: "Google Ads",
  facebook_ads: "Facebook Ads",
  organic_seo: "Organic SEO",
  direct: "Direct",
};

type AcquisitionTouch = {
  landing_pathname?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
};

const ORGANIC_PATH_PREFIXES = [
  "/locations/",
  "/cleaning-services/",
  "/services/",
  "/blog/",
  "/cleaning-prices",
  "/maid-services",
] as const;

function readAcquisitionTouch(payload: Record<string, unknown>): AcquisitionTouch | null {
  const ft = payload.acquisition_first_touch;
  if (!ft || typeof ft !== "object" || Array.isArray(ft)) return null;
  return ft as AcquisitionTouch;
}

function str(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isOrganicPath(pathname: string): boolean {
  if (!pathname) return false;
  if (pathname.startsWith("/book") || pathname.startsWith("/booking") || pathname.startsWith("/office")) {
    return false;
  }
  if (ORGANIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  // City/suburb SEO routes like /cape-town/claremont
  return /^\/[a-z0-9-]+\/[a-z0-9-]+\/?$/.test(pathname);
}

const PAID_UTM_MEDIUMS = new Set([
  "cpc",
  "ppc",
  "paid",
  "paid_social",
  "paid-social",
  "paidsocial",
  "display",
  "pmax",
  "performance_max",
  "cpm",
  "cpa",
  "cpv",
  "banner",
]);

function isPaidUtmMedium(medium: string): boolean {
  const m = medium.trim().toLowerCase();
  if (!m || m === "—" || m === "(none)" || m === "none") return false;
  if (PAID_UTM_MEDIUMS.has(m)) return true;
  return m.includes("paid");
}

function isGoogleUtmSource(utmSource: string): boolean {
  return (
    utmSource.includes("google") ||
    utmSource.includes("adwords") ||
    utmSource.includes("youtube") ||
    utmSource.includes("doubleclick")
  );
}

function isFacebookUtmSource(utmSource: string, source: string, utmMedium: string): boolean {
  return (
    utmSource.includes("facebook") ||
    utmSource.includes("fb") ||
    utmSource.includes("instagram") ||
    utmSource.includes("meta") ||
    utmMedium.includes("facebook") ||
    source.includes("facebook")
  );
}

function inferChannelFromSignals(signals: {
  source: string;
  pathname: string;
  pageType: string;
  gclid: string;
  fbclid: string;
  utmSource: string;
  utmMedium: string;
  landingPathname: string;
}): MarketingChannel {
  const { source, pathname, pageType, gclid, fbclid, utmSource, utmMedium, landingPathname } = signals;

  // Click IDs are definitive paid-ad signals.
  if (gclid) return "google_ads";
  if (fbclid) return "facebook_ads";

  // UTM: only treat Google/Facebook as ads when medium is paid (cpc, pmax, paid_social, …).
  if (isGoogleUtmSource(utmSource) && isPaidUtmMedium(utmMedium)) {
    return "google_ads";
  }
  if (isFacebookUtmSource(utmSource, source, utmMedium) && isPaidUtmMedium(utmMedium)) {
    return "facebook_ads";
  }

  if (
    source.includes("ads_lp") ||
    pageType === "google_ads_lp" ||
    pathname.startsWith("/lp/cleaning") ||
    landingPathname.startsWith("/lp/cleaning")
  ) {
    return "google_ads";
  }

  // Organic Google/Facebook search or social (non-paid medium) → SEO / organic bucket.
  if (
    (isGoogleUtmSource(utmSource) || isFacebookUtmSource(utmSource, source, utmMedium)) &&
    (utmMedium === "organic" || utmMedium === "seo" || utmMedium === "social" || utmMedium === "referral")
  ) {
    return "organic_seo";
  }

  for (const path of [pathname, landingPathname]) {
    if (isOrganicPath(path)) return "organic_seo";
  }

  return "direct";
}

/** Resolve marketing channel from a growth event payload (uses first-touch when present). */
export function inferMarketingChannel(payload: Record<string, unknown>): MarketingChannel {
  const ft = readAcquisitionTouch(payload);
  return inferChannelFromSignals({
    source: str(payload.source),
    pathname: str(payload.pathname ?? payload.landing_page_slug),
    pageType: str(payload.page_type),
    gclid: str(payload.gclid ?? ft?.gclid),
    fbclid: str(payload.fbclid ?? ft?.fbclid),
    utmSource: str(payload.utm_source ?? ft?.utm_source),
    utmMedium: str(payload.utm_medium ?? ft?.utm_medium),
    landingPathname: str(ft?.landing_pathname ?? payload.landing_page_slug),
  });
}

const CHANNEL_PRIORITY: Record<MarketingChannel, number> = {
  direct: 0,
  organic_seo: 1,
  facebook_ads: 2,
  google_ads: 2,
};

/** Prefer stronger attribution signals when a session emits multiple events. */
export function mergeSessionChannel(
  existing: MarketingChannel | undefined,
  next: MarketingChannel,
): MarketingChannel {
  if (!existing) return next;
  return CHANNEL_PRIORITY[next] > CHANNEL_PRIORITY[existing] ? next : existing;
}
