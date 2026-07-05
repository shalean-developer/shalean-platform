import type { BookingV2ExtraTypeFilter } from "@/lib/booking-v2/bookingV2CatalogTypes";
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

function normalizeExtraSlug(slug: string): string {
  return slug.replace(/_/g, "-");
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
  // Office / quick lines and other admin-added slugs default to maintenance-style add-ons.
  return ["light", "all"];
}

function serviceDefsForPricingSlug(
  pricingServiceSlug: string,
  configJson: unknown,
): ReturnType<typeof buildDefaultBookingV2CatalogConfig>["services"] {
  const catalog =
    parseBookingV2CatalogConfig(
      configJson && typeof configJson === "object"
        ? (configJson as Record<string, unknown>).booking_v2
        : null,
    ) ?? buildDefaultBookingV2CatalogConfig();

  const matches = catalog.services.filter(
    (def) =>
      def.isActive !== false &&
      (def.pricingSlug === pricingServiceSlug || def.slug === pricingServiceSlug),
  );

  return matches.length ? matches : [];
}

export function extraTypesForPricingServiceSlug(
  pricingServiceSlug: string,
  configJson?: unknown,
): BookingV2ExtraTypeFilter[] {
  const defs = serviceDefsForPricingSlug(pricingServiceSlug, configJson);
  if (!defs.length) return extraTypesFromStaticMaps(pricingServiceSlug);

  const types = new Set<BookingV2ExtraTypeFilter>();
  for (const def of defs) {
    for (const type of def.extraTypes) types.add(type);
  }
  return types.length ? [...types] : extraTypesFromStaticMaps(pricingServiceSlug);
}

export function filterExtrasForPricingService(
  pricingServiceSlug: string,
  extras: QuotePricingExtraRow[],
  configJson?: unknown,
): QuotePricingServiceExtra[] {
  const defs = serviceDefsForPricingSlug(pricingServiceSlug, configJson);
  const allowlists = defs
    .map((def) => def.extraSlugs?.map(normalizeExtraSlug).filter(Boolean))
    .filter((list): list is string[] => Boolean(list?.length));
  const allowlist = allowlists.length === 1 ? allowlists[0] : undefined;
  const extraTypes = extraTypesForPricingServiceSlug(pricingServiceSlug, configJson);

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
