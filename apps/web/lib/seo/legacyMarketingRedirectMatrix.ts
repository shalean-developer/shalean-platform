/**
 * Evidence-based one-hop permanent redirects for legacy public `.co.za` marketing URLs.
 * Consumed by `proxy.ts` and sitemap/robots regression tests.
 */

export type LegacyMarketingRedirect = {
  readonly source: string;
  readonly destination: string;
  /** HTTP status — permanent migrations only. */
  readonly status: 301 | 308;
};

/** Exact-path marketing migrations (normalized without trailing slash). */
export const LEGACY_MARKETING_EXACT_REDIRECTS: readonly LegacyMarketingRedirect[] = [
  { source: "/details", destination: "/book", status: 308 },
  { source: "/testimonials", destination: "/reviews", status: 308 },
  { source: "/team", destination: "/about", status: 308 },
  { source: "/how-it-works", destination: "/#how-it-works", status: 308 },
  { source: "/terms", destination: "/terms-of-service", status: 308 },
  { source: "/tos", destination: "/terms-of-service", status: 308 },
  { source: "/privacy", destination: "/privacy-policy", status: 308 },
  { source: "/cleaning-services-cape-town", destination: "/services", status: 308 },
  { source: "/maid-services-cape-town", destination: "/services", status: 308 },
  { source: "/cleaning-services", destination: "/services", status: 308 },
  {
    source: "/cleaning-prices-cape-town",
    destination: "/blog/how-much-does-cleaning-cost-cape-town-2026",
    status: 308,
  },
  { source: "/home-cleaning", destination: "/services/standard-cleaning-cape-town", status: 308 },
  { source: "/deep-cleaning", destination: "/services/deep-cleaning-cape-town", status: 308 },
  { source: "/pricing", destination: "/blog/how-much-does-cleaning-cost-cape-town-2026", status: 308 },
  { source: "/help", destination: "/faq", status: 308 },
  { source: "/help-centre", destination: "/faq", status: 308 },
  { source: "/help-center", destination: "/faq", status: 308 },
] as const;

const EXACT_MAP = new Map(
  LEGACY_MARKETING_EXACT_REDIRECTS.map((r) => [r.source, r] as const),
);

export function normalizeLegacyPathname(pathname: string): string {
  const t = pathname.trim();
  if (!t || t === "/") return "/";
  return t.replace(/\/+$/, "") || "/";
}

/** Resolve an exact-path legacy marketing redirect, or null. */
export function resolveLegacyMarketingExactRedirect(
  pathname: string,
): LegacyMarketingRedirect | null {
  return EXACT_MAP.get(normalizeLegacyPathname(pathname)) ?? null;
}

/** All redirect source paths — must never appear in the sitemap. */
export function legacyMarketingRedirectSourcePaths(): string[] {
  return LEGACY_MARKETING_EXACT_REDIRECTS.map((r) => r.source);
}
