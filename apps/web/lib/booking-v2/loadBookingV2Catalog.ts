import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  SERVICE_CONFIG,
  SERVICE_SLUGS,
  type ServiceSlug,
  type ServiceExtra,
} from "@/src/features/booking-v2/config/serviceConfig";
import {
  defaultBookingV2FeesConfig,
  parseBookingV2FeesConfig,
} from "@/lib/booking-v2/bookingV2FeesConfig";
import type { BookingV2FeesConfig } from "@/lib/booking-v2/types";

export const DB_SLUG_MAP: Record<ServiceSlug, string> = {
  "regular-cleaning": "standard",
  "deep-cleaning": "deep",
  "moving-cleaning": "move",
  "office-cleaning": "standard",
  "carpet-cleaning": "carpet",
  "airbnb-cleaning": "airbnb",
};

export const EXTRA_TYPE_MAP: Record<ServiceSlug, string[]> = {
  "regular-cleaning": ["light", "all"],
  "deep-cleaning": ["heavy", "all"],
  "moving-cleaning": ["heavy", "all"],
  "office-cleaning": ["light", "all"],
  "carpet-cleaning": ["heavy", "all"],
  "airbnb-cleaning": ["light", "all"],
};

export type LiveExtra = {
  id: string;
  label: string;
  description: string;
  priceZar: number;
  isPopular: boolean;
};

export type LiveServiceConfig = {
  slug: ServiceSlug;
  basePrice: number;
  pricePerBedroom: number;
  pricePerBathroom: number;
  pricePerExtraRoom: number;
  pricePerExtraCleaner: number;
  estimatedDurationHours: number;
  extras: LiveExtra[];
};

export type ServicesCatalog = Record<ServiceSlug, LiveServiceConfig>;

export type BookingV2CatalogPayload = {
  catalog: ServicesCatalog;
  feesConfig: BookingV2FeesConfig;
};

function normalizeExtraSlug(id: string): string {
  return id.replace(/_/g, "-");
}

function findExtraPrice(
  dbExtras: Record<string, { price: number }>,
  staticId: string,
): number | null {
  const direct = dbExtras[staticId] ?? dbExtras[normalizeExtraSlug(staticId)];
  return direct ? direct.price : null;
}

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

  let dbExtras: Record<
    string,
    { price: number; service_type: string; name: string; description: string; is_popular: boolean }
  > = {};

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
        .select("slug, price, service_type, name, description, is_popular")
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
        };
      }
    }

    configJson = (configRow as { config?: unknown } | null)?.config ?? null;
  }

  const suppliesKitZar =
    dbExtras["supplies-kit"]?.price ??
    findExtraPrice(dbExtras, "supplies_kit") ??
    undefined;
  const extraCleanerZar =
    dbExtras["extra-cleaner"]?.price ??
    findExtraPrice(dbExtras, "extra_cleaner") ??
    undefined;

  const feesConfig = configJson
    ? parseBookingV2FeesConfig(configJson, { suppliesKitZar, extraCleanerZar })
    : defaultBookingV2FeesConfig({ suppliesKitZar, extraCleanerZar });

  if (extraCleanerZar != null) {
    feesConfig.extraCleanerFeeZar = extraCleanerZar;
  }

  const catalog: ServicesCatalog = {} as ServicesCatalog;

  for (const slug of SERVICE_SLUGS) {
    const staticConfig = SERVICE_CONFIG[slug];
    const dbSlug = DB_SLUG_MAP[slug];
    const dbSvc = dbServices[dbSlug] ?? null;
    const extraTypes = EXTRA_TYPE_MAP[slug];

    const extras: LiveExtra[] = staticConfig.extras.map((staticExtra: ServiceExtra) => {
      const dbExtra =
        dbExtras[staticExtra.id] ?? dbExtras[normalizeExtraSlug(staticExtra.id)];

      const dbMatchesType =
        dbExtra &&
        (dbExtra.service_type === "all" || extraTypes.includes(dbExtra.service_type));

      return {
        id: staticExtra.id,
        label: dbExtra?.name ?? staticExtra.label,
        description: dbExtra?.description || staticExtra.description,
        priceZar: dbMatchesType ? dbExtra.price : staticExtra.priceZar,
        isPopular: dbExtra?.is_popular ?? false,
      };
    });

    catalog[slug] = {
      slug,
      basePrice: dbSvc?.base_price ?? staticConfig.basePrice,
      pricePerBedroom: dbSvc?.price_per_bedroom ?? 0,
      pricePerBathroom: dbSvc?.price_per_bathroom ?? 0,
      pricePerExtraRoom: dbSvc?.price_per_extra_room ?? 0,
      pricePerExtraCleaner: feesConfig.extraCleanerFeeZar || staticConfig.pricePerExtraCleaner,
      estimatedDurationHours: dbSvc?.duration_base
        ? Math.max(1, Math.round(dbSvc.duration_base))
        : staticConfig.estimatedDurationHours,
      extras,
    };
  }

  return { catalog, feesConfig };
}
