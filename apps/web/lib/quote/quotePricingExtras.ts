import type {
  BookingV2ExtraTypeFilter,
  BookingV2ServiceDefinition,
} from "@/lib/booking-v2/bookingV2CatalogTypes";
import {
  buildDefaultBookingV2CatalogConfig,
  BOOKING_V2_INTERNAL_EXTRA_SLUGS,
  parseBookingV2CatalogConfig,
} from "@/lib/booking-v2/bookingV2ServiceDefinitions";
import { DB_SLUG_MAP, EXTRA_TYPE_MAP } from "@/lib/booking-v2/loadBookingV2CatalogMaps";
import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";

export type QuotePricingExtraRow = {
  id: string;
  slug: string;
  name: string;
  service_type: string;
  is_popular: boolean;
  sort_order: number;
};

export type QuotePricingServiceExtra = {
  id: string;
  slug: string;
  name: string;
  is_popular: boolean;
};

/**
 * Quote `pricing_services.slug` → booking v2 service used for add-on resolution.
 * Matches checkout: each line gets the same extras as its booking flow service card.
 */
export const QUOTE_PRICING_TO_BOOKING_V2: Record<string, ServiceSlug> = {
  quick: "office-cleaning",
  office: "office-cleaning",
  standard: "regular-cleaning",
  airbnb: "airbnb-cleaning",
  deep: "deep-cleaning",
  move: "moving-cleaning",
  carpet: "carpet-cleaning",
};

function normalizeExtraSlug(slug: string): string {
  return slug.replace(/_/g, "-");
}

function parseBookingV2Config(configJson?: unknown) {
  return (
    parseBookingV2CatalogConfig(
      configJson && typeof configJson === "object"
        ? (configJson as Record<string, unknown>).booking_v2
        : null,
    ) ?? buildDefaultBookingV2CatalogConfig()
  );
}

function extraTypesFromStaticMaps(pricingServiceSlug: string): BookingV2ExtraTypeFilter[] {
  const types = new Set<BookingV2ExtraTypeFilter>();
  for (const [serviceSlug, pricingSlug] of Object.entries(DB_SLUG_MAP) as [ServiceSlug, string][]) {
    if (pricingSlug === pricingServiceSlug) {
      for (const type of EXTRA_TYPE_MAP[serviceSlug]) {
        types.add(type);
      }
    }
  }
  if (types.size > 0) return [...types];
  return ["light", "all"];
}

function inferBookingV2SlugFromPricingSlug(pricingServiceSlug: string): ServiceSlug | null {
  const mapped = QUOTE_PRICING_TO_BOOKING_V2[pricingServiceSlug];
  if (mapped) return mapped;

  const matches = (Object.entries(DB_SLUG_MAP) as [ServiceSlug, string][])
    .filter(([, pricingSlug]) => pricingSlug === pricingServiceSlug)
    .map(([serviceSlug]) => serviceSlug);

  return matches.length === 1 ? matches[0] : null;
}

/** Single booking v2 service definition for a quote pricing line (same as checkout catalog). */
export function bookingV2ServiceDefForPricingSlug(
  pricingServiceSlug: string,
  configJson?: unknown,
): BookingV2ServiceDefinition | null {
  const bookingSlug = inferBookingV2SlugFromPricingSlug(pricingServiceSlug);
  if (!bookingSlug) return null;

  const catalog = parseBookingV2Config(configJson);
  return catalog.services.find((def) => def.isActive !== false && def.slug === bookingSlug) ?? null;
}

export function extraTypesForPricingServiceSlug(
  pricingServiceSlug: string,
  configJson?: unknown,
): BookingV2ExtraTypeFilter[] {
  const def = bookingV2ServiceDefForPricingSlug(pricingServiceSlug, configJson);
  if (def?.extraTypes.length) return [...def.extraTypes];
  return extraTypesFromStaticMaps(pricingServiceSlug);
}

export function filterExtrasForPricingService(
  pricingServiceSlug: string,
  extras: QuotePricingExtraRow[],
  configJson?: unknown,
): QuotePricingServiceExtra[] {
  const serviceDef = bookingV2ServiceDefForPricingSlug(pricingServiceSlug, configJson);
  const allowlist = serviceDef?.extraSlugs?.map(normalizeExtraSlug).filter(Boolean);
  const extraTypes = serviceDef?.extraTypes ?? extraTypesForPricingServiceSlug(pricingServiceSlug, configJson);

  return extras
    .filter((extra) => !BOOKING_V2_INTERNAL_EXTRA_SLUGS.has(extra.slug))
    .filter((extra) => {
      if (allowlist?.length) {
        return allowlist.includes(normalizeExtraSlug(extra.slug));
      }
      return (
        extra.service_type === "all" ||
        extraTypes.includes(extra.service_type as BookingV2ExtraTypeFilter)
      );
    })
    .sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug))
    .map(({ id, slug, name, is_popular }) => ({ id, slug, name, is_popular }));
}

export function attachExtrasToPricingServices<
  T extends { slug: string },
>(services: T[], extras: QuotePricingExtraRow[], configJson?: unknown): Array<T & { extras: QuotePricingServiceExtra[] }> {
  return services.map((service) => ({
    ...service,
    extras: filterExtrasForPricingService(service.slug, extras, configJson),
  }));
}

/** @deprecated Prefer service.extras from pricing-catalog API. */
export function extraMatchesPricingService(
  extra: { slug: string; service_type: string },
  pricingServiceSlug: string | null,
  configJson?: unknown,
): boolean {
  if (!pricingServiceSlug) return false;
  const filtered = filterExtrasForPricingService(
    pricingServiceSlug,
    [
      {
        id: extra.slug,
        slug: extra.slug,
        name: extra.slug,
        service_type: extra.service_type,
        is_popular: false,
        sort_order: 0,
      },
    ],
    configJson,
  );
  return filtered.some((row) => row.slug === extra.slug);
}
