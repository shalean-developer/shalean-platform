import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SERVICE_CONFIG, SERVICE_SLUGS, type ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import {
  defaultBookingV2FeesConfig,
  parseBookingV2FeesConfig,
} from "@/lib/booking-v2/bookingV2FeesConfig";
import {
  BOOKING_V2_INTERNAL_EXTRA_SLUGS,
  buildDefaultBookingV2CatalogConfig,
  parseBookingV2CatalogConfig,
} from "@/lib/booking-v2/bookingV2ServiceDefinitions";
import type {
  BookingV2CatalogPayload,
  BookingV2SchedulingConfig,
  LiveExtra,
  LiveServiceConfig,
  ServicesCatalog,
} from "@/lib/booking-v2/bookingV2CatalogTypes";
import { DB_SLUG_MAP } from "@/lib/booking-v2/loadBookingV2CatalogMaps";

export type {
  LiveExtra,
  LiveServiceConfig,
  ServicesCatalog,
  BookingV2CatalogPayload,
} from "@/lib/booking-v2/bookingV2CatalogTypes";

export { DB_SLUG_MAP, EXTRA_TYPE_MAP } from "@/lib/booking-v2/loadBookingV2CatalogMaps";

type DbExtraRow = {
  price: number;
  service_type: string;
  name: string;
  description: string;
  is_popular: boolean;
  sort_order: number;
};

function normalizeExtraSlug(id: string): string {
  return id.replace(/_/g, "-");
}

import type { BookingV2ServiceDefinition } from "@/lib/booking-v2/bookingV2CatalogTypes";

function buildExtrasForService(
  serviceDef: BookingV2ServiceDefinition,
  dbExtras: Record<string, DbExtraRow>,
): LiveExtra[] {
  const allowlist = serviceDef.extraSlugs?.map((s) => normalizeExtraSlug(s));
  const rows = Object.entries(dbExtras)
    .filter(([slug]) => !BOOKING_V2_INTERNAL_EXTRA_SLUGS.has(slug))
    .filter(([slug, row]) => {
      if (allowlist?.length) {
        return allowlist.includes(slug) || allowlist.includes(normalizeExtraSlug(slug));
      }
      return row.service_type === "all" || serviceDef.extraTypes.includes(row.service_type as "light" | "heavy" | "all");
    })
    .sort((a, b) => a[1].sort_order - b[1].sort_order || a[0].localeCompare(b[0]));

  return rows.map(([slug, row]) => ({
    id: slug,
    label: row.name,
    description: row.description,
    priceZar: row.price,
    isPopular: row.is_popular,
  }));
}

const DEFAULT_SCHEDULING: BookingV2SchedulingConfig = {
  leadMinutes: 120,
  slotStartHour: 8,
  slotEndHour: 12,
  slotIntervalMinutes: 30,
  timezone: "Africa/Johannesburg",
};

export async function loadBookingV2Catalog(): Promise<BookingV2CatalogPayload> {
  const admin = getSupabaseAdmin();

  let dbServices: Record<
    string,
    {
      base_price: number;
      price_per_bedroom: number;
      price_per_bathroom: number;
      price_per_extra_room: number;
      duration_base: number;
    }
  > = {};

  let dbExtras: Record<string, DbExtraRow> = {};
  let configJson: unknown = null;

  if (admin) {
    const [{ data: svcRows }, { data: extRows }, { data: configRow }] = await Promise.all([
      admin
        .from("pricing_services")
        .select(
          "slug, base_price, price_per_bedroom, price_per_bathroom, price_per_extra_room, duration_base",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      admin
        .from("pricing_extras")
        .select("slug, price, service_type, name, description, is_popular, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      admin.from("pricing_booking_config").select("config").eq("id", "default").maybeSingle(),
    ]);

    if (svcRows) {
      for (const raw of svcRows) {
        const row = raw as Record<string, unknown>;
        const slug = typeof row.slug === "string" ? row.slug.trim() : "";
        if (!slug) continue;
        dbServices[slug] = {
          base_price: Math.round(Number(row.base_price) || 0),
          price_per_bedroom: Math.round(Number(row.price_per_bedroom) || 0),
          price_per_bathroom: Math.round(Number(row.price_per_bathroom) || 0),
          price_per_extra_room: Math.round(Number(row.price_per_extra_room) || 0),
          duration_base: Number(row.duration_base) || 0,
        };
      }
    }

    if (extRows) {
      for (const raw of extRows) {
        const row = raw as Record<string, unknown>;
        const slug = typeof row.slug === "string" ? row.slug.trim() : "";
        if (!slug) continue;
        dbExtras[slug] = {
          price: Math.round(Number(row.price) || 0),
          service_type: typeof row.service_type === "string" ? row.service_type : "all",
          name: typeof row.name === "string" ? row.name : slug,
          description: typeof row.description === "string" ? row.description : "",
          is_popular: row.is_popular === true,
          sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
        };
      }
    }

    configJson = (configRow as { config?: unknown } | null)?.config ?? null;
  }

  const extraCleanerZar =
    dbExtras["extra-cleaner"]?.price ?? dbExtras[normalizeExtraSlug("extra_cleaner")]?.price ?? undefined;

  const feesConfig = configJson
    ? parseBookingV2FeesConfig(configJson, { extraCleanerZar })
    : defaultBookingV2FeesConfig({ extraCleanerZar });

  if (extraCleanerZar != null) {
    feesConfig.extraCleanerFeeZar = extraCleanerZar;
  }

  const configRoot = configJson && typeof configJson === "object" ? (configJson as Record<string, unknown>) : {};
  const bookingV2Raw = configRoot.booking_v2;
  const catalogConfig =
    parseBookingV2CatalogConfig(bookingV2Raw) ?? buildDefaultBookingV2CatalogConfig();

  const scheduling: BookingV2SchedulingConfig = {
    ...DEFAULT_SCHEDULING,
    ...(catalogConfig.scheduling ?? {}),
  };

  const catalog: Partial<ServicesCatalog> = {};
  const activeServiceSlugs: ServiceSlug[] = [];

  const sortedServices = [...catalogConfig.services].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );

  for (const serviceDef of sortedServices) {
    if (serviceDef.isActive === false) continue;
    const slug = serviceDef.slug;
    const staticFallback = SERVICE_CONFIG[slug];
    const dbSlug = serviceDef.pricingSlug || DB_SLUG_MAP[slug];
    const dbSvc = dbServices[dbSlug] ?? null;

    const extras = buildExtrasForService(serviceDef, dbExtras);

    catalog[slug] = {
      slug,
      label: serviceDef.label,
      shortLabel: serviceDef.shortLabel,
      description: serviceDef.description,
      cleanerMode: serviceDef.cleanerMode,
      showCleaningProductsQuestion: serviceDef.showCleaningProductsQuestion,
      allowsExtraCleaner: serviceDef.allowsExtraCleaner,
      step1Questions: serviceDef.step1Questions,
      basePrice: dbSvc?.base_price ?? staticFallback.basePrice,
      pricePerBedroom: dbSvc?.price_per_bedroom ?? 0,
      pricePerBathroom: dbSvc?.price_per_bathroom ?? 0,
      pricePerExtraRoom: dbSvc?.price_per_extra_room ?? 0,
      pricePerExtraCleaner: feesConfig.extraCleanerFeeZar || staticFallback.pricePerExtraCleaner,
      estimatedDurationHours: dbSvc?.duration_base
        ? Math.max(1, Math.round(dbSvc.duration_base))
        : staticFallback.estimatedDurationHours,
      extras,
    };
    activeServiceSlugs.push(slug);
  }

  for (const slug of SERVICE_SLUGS) {
    if (!catalog[slug]) {
      const staticFallback = SERVICE_CONFIG[slug];
      const dbSlug = DB_SLUG_MAP[slug];
      const dbSvc = dbServices[dbSlug] ?? null;
      catalog[slug] = {
        slug,
        label: staticFallback.label,
        shortLabel: staticFallback.shortLabel,
        description: staticFallback.description,
        cleanerMode: staticFallback.cleanerMode,
        showCleaningProductsQuestion: slug !== "deep-cleaning" && slug !== "moving-cleaning",
        allowsExtraCleaner: slug === "regular-cleaning" || slug === "airbnb-cleaning" || slug === "office-cleaning" || slug === "carpet-cleaning",
        step1Questions: staticFallback.step1Questions,
        basePrice: dbSvc?.base_price ?? staticFallback.basePrice,
        pricePerBedroom: dbSvc?.price_per_bedroom ?? 0,
        pricePerBathroom: dbSvc?.price_per_bathroom ?? 0,
        pricePerExtraRoom: dbSvc?.price_per_extra_room ?? 0,
        pricePerExtraCleaner: feesConfig.extraCleanerFeeZar || staticFallback.pricePerExtraCleaner,
        estimatedDurationHours: dbSvc?.duration_base
          ? Math.max(1, Math.round(dbSvc.duration_base))
          : staticFallback.estimatedDurationHours,
        extras: [],
      };
    }
  }

  return {
    catalog: catalog as ServicesCatalog,
    feesConfig,
    scheduling,
    activeServiceSlugs,
  };
}
