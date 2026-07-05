import type {
  QuoteCatalogSelection,
  QuotePublicExtra,
  QuotePublicService,
  QuotePublicServiceExtra,
} from "@/lib/quote/types";

export const QUOTE_UNSURE_SERVICE_SLUG = "unsure";
export const QUOTE_UNSURE_SERVICE_NAME = "Not sure — recommend for me";

/** Pricing service slugs where optional add-ons are not offered on the quote form. */
export const QUOTE_SERVICES_WITHOUT_EXTRAS = new Set(["deep", "move"]);

export function quoteServiceShowsExtras(primaryServiceSlug: string | null): boolean {
  if (!primaryServiceSlug || primaryServiceSlug === QUOTE_UNSURE_SERVICE_SLUG) return false;
  return !QUOTE_SERVICES_WITHOUT_EXTRAS.has(primaryServiceSlug);
}

export function extrasForSelectedService(
  primaryServiceSlug: string | null,
  services: QuotePublicService[],
): QuotePublicServiceExtra[] {
  if (!quoteServiceShowsExtras(primaryServiceSlug)) return [];
  return services.find((service) => service.slug === primaryServiceSlug)?.extras ?? [];
}

export function extraAllowedForService(
  extraSlug: string,
  primaryServiceSlug: string | null,
  services: QuotePublicService[],
): boolean {
  return extrasForSelectedService(primaryServiceSlug, services).some((extra) => extra.slug === extraSlug);
}

export function buildQuoteSelectedItems(input: {
  primaryServiceSlug: string | null;
  services: QuotePublicService[];
  selectedExtraSlugs: string[];
  extras: QuotePublicExtra[];
  bedrooms: number;
  bathrooms: number;
  includeHomeSize: boolean;
}): QuoteCatalogSelection[] {
  const items: QuoteCatalogSelection[] = [];
  const {
    primaryServiceSlug,
    services,
    selectedExtraSlugs,
    extras,
    bedrooms,
    bathrooms,
    includeHomeSize,
  } = input;

  if (!primaryServiceSlug) return items;

  if (primaryServiceSlug === QUOTE_UNSURE_SERVICE_SLUG) {
    items.push({
      kind: "service",
      slug: QUOTE_UNSURE_SERVICE_SLUG,
      name: QUOTE_UNSURE_SERVICE_NAME,
      quantity: 1,
    });
  } else {
    const service = services.find((s) => s.slug === primaryServiceSlug);
    if (service) {
      const roomNote =
        includeHomeSize && (bedrooms > 0 || bathrooms > 0)
          ? ` (${bedrooms} bed, ${bathrooms} bath)`
          : "";
      items.push({
        kind: "service",
        slug: service.slug,
        name: `${service.name}${roomNote}`,
        quantity: 1,
      });
    }
  }

  const allowedSlugs = new Set(
    extrasForSelectedService(primaryServiceSlug, services).map((extra) => extra.slug),
  );

  for (const slug of selectedExtraSlugs) {
    if (!allowedSlugs.has(slug)) continue;
    const extra = extras.find((e) => e.slug === slug);
    if (extra) {
      items.push({ kind: "extra", slug: extra.slug, name: extra.name, quantity: 1 });
    }
  }

  return items;
}

export function primaryServiceLabel(
  primaryServiceSlug: string | null,
  services: QuotePublicService[],
): string | null {
  if (!primaryServiceSlug) return null;
  if (primaryServiceSlug === QUOTE_UNSURE_SERVICE_SLUG) return QUOTE_UNSURE_SERVICE_NAME;
  return services.find((s) => s.slug === primaryServiceSlug)?.name ?? null;
}
