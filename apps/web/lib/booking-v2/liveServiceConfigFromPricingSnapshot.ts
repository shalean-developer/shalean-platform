import type { BookingV2FeesConfig } from "@/lib/booking-v2/types";
import type { LiveServiceConfig } from "@/lib/booking-v2/bookingV2CatalogTypes";
import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import {
  pricingSnapshotServiceKeyForBookingV2Slug,
  type PricingRatesSnapshot,
} from "@/lib/pricing/pricingRatesSnapshot";
import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";
import { isExtraSlugAllowedForService } from "@/lib/booking-v2/serviceExtraSlugs";

/**
 * Rehydrates the price/duration inputs needed by Booking V2 from a frozen
 * pricing_versions snapshot. UI copy/questions remain static; monetary values
 * and duration coefficients come only from the frozen version.
 */
export function liveServiceConfigFromPricingSnapshot(params: {
  serviceSlug: ServiceSlug;
  snapshot: PricingRatesSnapshot;
  feesConfig: BookingV2FeesConfig;
}): LiveServiceConfig | null {
  const { serviceSlug, snapshot, feesConfig } = params;
  const key = pricingSnapshotServiceKeyForBookingV2Slug(serviceSlug);
  if (!key) return null;
  const tariff = snapshot.services[key];
  if (!tariff) return null;
  const staticConfig = SERVICE_CONFIG[serviceSlug];
  const extras = Object.entries(snapshot.extras)
    .filter(([slug, row]) => row.services.includes(key) && isExtraSlugAllowedForService(serviceSlug, slug))
    .filter(([, row]) => Number.isFinite(row.price) && row.price > 0)
    .map(([slug, row]) => ({
      id: slug,
      label: row.name ?? slug,
      description: row.description ?? "",
      priceZar: row.price,
      isPopular: row.isPopular === true,
    }));

  return {
    slug: serviceSlug,
    label: staticConfig.label,
    shortLabel: staticConfig.shortLabel,
    description: staticConfig.description,
    cleanerMode: staticConfig.cleanerMode,
    // Equipment eligibility is product behavior, not a monetary tariff. Preserve
    // the service policy while all rates/durations still come from the frozen snapshot.
    showEquipmentQuestion: staticConfig.showEquipmentQuestion ?? false,
    allowsExtraCleaner:
      serviceSlug === "regular-cleaning" ||
      serviceSlug === "airbnb-cleaning" ||
      serviceSlug === "office-cleaning",
    step1Questions: staticConfig.step1Questions,
    basePrice: tariff.base,
    pricePerBedroom: tariff.bedroom,
    pricePerBathroom: tariff.bathroom,
    pricePerExtraRoom: tariff.extraRoom,
    pricePerExtraCleaner: feesConfig.extraCleanerFeeZar,
    estimatedDurationHours: tariff.duration.base,
    durationBaseHours: tariff.duration.base,
    durationPerBedroomHours: tariff.duration.bedroom,
    durationPerBathroomHours: tariff.duration.bathroom,
    durationPerExtraRoomHours: tariff.duration.extraRoom,
    minDurationHours: tariff.durationLimits?.minHours ?? 3.5,
    maxDurationHours: tariff.durationLimits?.maxHours ?? 8,
    extras,
  };
}
