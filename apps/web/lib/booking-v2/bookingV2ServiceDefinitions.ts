import {
  SERVICE_CONFIG,
  SERVICE_SLUGS,
  serviceShowsEquipmentQuestion,
  type ServiceSlug,
} from "@/src/features/booking-v2/config/serviceConfig";
import { EXTRA_CLEANER_SERVICE_SLUGS } from "@/lib/booking-v2/propertyFactorPricing";
import type { BookingV2CatalogConfig, BookingV2ServiceDefinition } from "@/lib/booking-v2/bookingV2CatalogTypes";
import { DB_SLUG_MAP, EXTRA_TYPE_MAP } from "@/lib/booking-v2/loadBookingV2CatalogMaps";

/** Slugs stored in pricing_extras but not shown as customer add-on cards. */
export const BOOKING_V2_INTERNAL_EXTRA_SLUGS = new Set(["extra-cleaner", "supplies-kit"]);

export function buildDefaultBookingV2CatalogConfig(): BookingV2CatalogConfig {
  const services: BookingV2ServiceDefinition[] = SERVICE_SLUGS.map((slug, index) => {
    const config = SERVICE_CONFIG[slug];
    return {
      slug,
      pricingSlug: DB_SLUG_MAP[slug],
      label: config.label,
      shortLabel: config.shortLabel,
      description: config.description,
      cleanerMode: config.cleanerMode,
      extraTypes: [...EXTRA_TYPE_MAP[slug]],
      showEquipmentQuestion: serviceShowsEquipmentQuestion(slug),
      showCleaningProductsQuestion: serviceShowsEquipmentQuestion(slug),
      allowsExtraCleaner: EXTRA_CLEANER_SERVICE_SLUGS.has(slug),
      step1Questions: config.step1Questions.map((q) => ({ ...q, options: q.options?.map((o) => ({ ...o })) })),
      isActive: true,
      sortOrder: (index + 1) * 10,
    };
  });

  return {
    services,
    scheduling: {
      leadMinutes: 120,
      slotStartHour: 8,
      slotEndHour: 12,
      slotIntervalMinutes: 30,
      timezone: "Africa/Johannesburg",
    },
  };
}

export function parseBookingV2CatalogConfig(raw: unknown): BookingV2CatalogConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const servicesRaw = root.services;
  if (!Array.isArray(servicesRaw) || servicesRaw.length === 0) return null;

  const services: BookingV2ServiceDefinition[] = [];
  for (const item of servicesRaw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const slug = typeof row.slug === "string" ? row.slug.trim() : "";
    if (!SERVICE_SLUGS.includes(slug as ServiceSlug)) continue;
    const pricingSlug = typeof row.pricingSlug === "string" ? row.pricingSlug.trim() : "";
    if (!pricingSlug) continue;

    const extraTypesRaw = row.extraTypes;
    const extraTypes =
      Array.isArray(extraTypesRaw) && extraTypesRaw.length
        ? extraTypesRaw.filter((t): t is "light" | "heavy" | "all" => t === "light" || t === "heavy" || t === "all")
        : [...EXTRA_TYPE_MAP[slug as ServiceSlug]];

    const questionsRaw = row.step1Questions;
    const step1Questions = Array.isArray(questionsRaw)
      ? questionsRaw.filter((q): q is BookingV2ServiceDefinition["step1Questions"][number] => {
          return Boolean(q && typeof q === "object" && typeof (q as { key?: unknown }).key === "string");
        })
      : SERVICE_CONFIG[slug as ServiceSlug].step1Questions;

    services.push({
      slug: slug as ServiceSlug,
      pricingSlug,
      label: typeof row.label === "string" ? row.label : SERVICE_CONFIG[slug as ServiceSlug].label,
      shortLabel:
        typeof row.shortLabel === "string" ? row.shortLabel : SERVICE_CONFIG[slug as ServiceSlug].shortLabel,
      description:
        typeof row.description === "string" ? row.description : SERVICE_CONFIG[slug as ServiceSlug].description,
      cleanerMode: row.cleanerMode === "team" ? "team" : "individual_cleaners",
      extraTypes,
      extraSlugs: Array.isArray(row.extraSlugs)
        ? row.extraSlugs.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        : undefined,
      showEquipmentQuestion:
        row.showEquipmentQuestion === true ||
        (row.showEquipmentQuestion !== false &&
          row.showCleaningProductsQuestion !== false &&
          serviceShowsEquipmentQuestion(slug as ServiceSlug)),
      showCleaningProductsQuestion:
        row.showEquipmentQuestion === true ||
        (row.showEquipmentQuestion !== false &&
          row.showCleaningProductsQuestion !== false &&
          serviceShowsEquipmentQuestion(slug as ServiceSlug)),
      allowsExtraCleaner:
        row.allowsExtraCleaner === true || EXTRA_CLEANER_SERVICE_SLUGS.has(slug as ServiceSlug),
      step1Questions,
      isActive: row.isActive !== false,
      sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : undefined,
    });
  }

  if (!services.length) return null;

  const schedulingRaw = root.scheduling;
  const defaults = buildDefaultBookingV2CatalogConfig().scheduling!;
  let scheduling = defaults;
  if (schedulingRaw && typeof schedulingRaw === "object") {
    const s = schedulingRaw as Record<string, unknown>;
    scheduling = {
      leadMinutes: Number.isFinite(Number(s.leadMinutes)) ? Number(s.leadMinutes) : defaults.leadMinutes,
      slotStartHour: Number.isFinite(Number(s.slotStartHour)) ? Number(s.slotStartHour) : defaults.slotStartHour,
      slotEndHour: Number.isFinite(Number(s.slotEndHour)) ? Number(s.slotEndHour) : defaults.slotEndHour,
      slotIntervalMinutes: Number.isFinite(Number(s.slotIntervalMinutes))
        ? Number(s.slotIntervalMinutes)
        : defaults.slotIntervalMinutes,
      timezone: typeof s.timezone === "string" ? s.timezone : defaults.timezone,
    };
  }

  return { services, scheduling };
}
