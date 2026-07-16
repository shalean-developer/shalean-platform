import { SERVICE_CONFIG, serviceShowsEquipmentQuestion } from "@/src/features/booking-v2/config/serviceConfig";
import type { BookingV2FormData } from "@/src/features/booking-v2/types";
import { calculateCustomerTotal } from "@/lib/booking-v2/calculateCustomerTotal";
import { buildAuthoritativeQuotePersistPatch } from "@/lib/booking/quote/bookingQuotePersistence";
import type { BookingV2FeesConfig, CustomerPricingBreakdown, CustomerTotalInput } from "@/lib/booking-v2/types";
import type { LiveServiceConfig } from "@/lib/booking-v2/bookingV2CatalogTypes";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";
import type { EquipmentQuoteResult } from "@/lib/booking-v2/equipmentPricing";
import { DEFAULT_SERVICE_DURATION_LIMITS } from "@/lib/pricing/pricingConfig";
import { resolveMovingPricingSlug } from "@/lib/booking-v2/resolvePricingServiceSlug";

export type BuildCustomerPricingFromFormParams = {
  serviceSlug: BookingV2FormData["serviceSlug"];
  values: Pick<
    BookingV2FormData,
    | "serviceDetails"
    | "selectedExtras"
    | "cleanerMode"
    | "cleanerCount"
    | "bookingType"
    | "recurringFrequency"
    | "equipmentRequired"
    | "equipmentQuote"
  >;
  liveConfig: LiveServiceConfig | null;
  feesConfig: BookingV2FeesConfig | null;
  /** Loyalty tier from user_profiles (server confirm). */
  vipTier?: string | null;
};

function catalogRatesForForm(
  serviceSlug: BookingV2FormData["serviceSlug"],
  catalogSource: LiveServiceConfig,
  serviceDetails: Record<string, string | number | boolean>,
): Pick<
  LiveServiceConfig,
  "basePrice" | "pricePerBedroom" | "pricePerBathroom" | "pricePerExtraRoom"
> {
  if (serviceSlug !== "moving-cleaning" || !catalogSource.moveVariantRates) {
    return {
      basePrice: catalogSource.basePrice,
      pricePerBedroom: catalogSource.pricePerBedroom,
      pricePerBathroom: catalogSource.pricePerBathroom,
      pricePerExtraRoom: catalogSource.pricePerExtraRoom,
    };
  }
  const preferred = resolveMovingPricingSlug(serviceDetails.moveType);
  const variant =
    preferred === "move-in"
      ? catalogSource.moveVariantRates.move_in
      : preferred === "move-out"
        ? catalogSource.moveVariantRates.move_out
        : undefined;
  if (!variant) {
    return {
      basePrice: catalogSource.basePrice,
      pricePerBedroom: catalogSource.pricePerBedroom,
      pricePerBathroom: catalogSource.pricePerBathroom,
      pricePerExtraRoom: catalogSource.pricePerExtraRoom,
    };
  }
  return {
    basePrice: variant.basePrice > 0 ? variant.basePrice : catalogSource.basePrice,
    pricePerBedroom: variant.pricePerBedroom > 0 ? variant.pricePerBedroom : catalogSource.pricePerBedroom,
    pricePerBathroom: variant.pricePerBathroom > 0 ? variant.pricePerBathroom : catalogSource.pricePerBathroom,
    pricePerExtraRoom:
      variant.pricePerExtraRoom > 0 ? variant.pricePerExtraRoom : catalogSource.pricePerExtraRoom,
  };
}

/** Shared quote input for display (client) and signed confirm (server). */
export function buildCustomerTotalInputFromForm(
  params: BuildCustomerPricingFromFormParams,
): CustomerTotalInput & { serviceSlug: BookingV2FormData["serviceSlug"] } {
  const { serviceSlug, values, liveConfig, feesConfig, vipTier } = params;
  const staticConfig = SERVICE_CONFIG[serviceSlug];

  const showEquipmentQuestion =
    liveConfig?.showEquipmentQuestion ??
    liveConfig?.showCleaningProductsQuestion ??
    serviceShowsEquipmentQuestion(serviceSlug);

  const catalogSource: LiveServiceConfig =
    liveConfig ?? {
      slug: serviceSlug,
      label: staticConfig.label,
      shortLabel: staticConfig.shortLabel,
      description: staticConfig.description,
      cleanerMode: staticConfig.cleanerMode,
      showEquipmentQuestion,
      allowsExtraCleaner:
        serviceSlug === "regular-cleaning" ||
        serviceSlug === "airbnb-cleaning" ||
        serviceSlug === "office-cleaning" ||
        serviceSlug === "carpet-cleaning",
      step1Questions: staticConfig.step1Questions,
      basePrice: staticConfig.basePrice,
      pricePerBedroom: 0,
      pricePerBathroom: 0,
      pricePerExtraRoom: 0,
      pricePerExtraCleaner: staticConfig.pricePerExtraCleaner,
      estimatedDurationHours: staticConfig.estimatedDurationHours,
      minDurationHours: DEFAULT_SERVICE_DURATION_LIMITS.minHours,
      maxDurationHours: DEFAULT_SERVICE_DURATION_LIMITS.maxHours,
      extras: [],
    };

  const equipmentRequired = values.equipmentRequired === "yes";
  const equipmentQuote: EquipmentQuoteResult | null =
    equipmentRequired && values.equipmentQuote ? values.equipmentQuote : null;

  const rates = catalogRatesForForm(serviceSlug, catalogSource, values.serviceDetails ?? {});

  return {
    serviceSlug,
    serviceLabel: catalogSource.label,
    serviceDetails: values.serviceDetails ?? {},
    selectedExtras: values.selectedExtras ?? [],
    cleanerMode: values.cleanerMode,
    cleanerCount: values.cleanerCount ?? 1,
    bookingType: values.bookingType,
    recurringFrequency: values.recurringFrequency ?? "",
    equipmentRequired,
    equipmentQuote,
    catalog: {
      basePrice: rates.basePrice,
      pricePerBedroom: rates.pricePerBedroom,
      pricePerBathroom: rates.pricePerBathroom,
      pricePerExtraRoom: rates.pricePerExtraRoom,
      pricePerExtraCleaner: catalogSource.pricePerExtraCleaner,
      estimatedDurationHours: catalogSource.estimatedDurationHours,
      minDurationHours: catalogSource.minDurationHours,
      maxDurationHours: catalogSource.maxDurationHours,
      extras: catalogSource.extras,
      allowsExtraCleaner: catalogSource.allowsExtraCleaner,
      showEquipmentQuestion:
        catalogSource.showEquipmentQuestion ??
        catalogSource.showCleaningProductsQuestion ??
        showEquipmentQuestion,
    },
    feesConfig: feesConfig ?? defaultBookingV2FeesConfig(),
    vipTier: vipTier ?? null,
  };
}

/**
 * Client-safe pricing for the booking UI.
 * Does not HMAC-sign — signing requires Node crypto + BOOKING_LOCK_HMAC_SECRET (server only).
 */
export function buildCustomerPricingFromForm(
  params: BuildCustomerPricingFromFormParams,
): CustomerPricingBreakdown {
  return calculateCustomerTotal(buildCustomerTotalInputFromForm(params));
}

export function pricingPersistFields(
  breakdown: CustomerPricingBreakdown,
  schedule?: { date: string; time: string } | null,
) {
  return buildAuthoritativeQuotePersistPatch({ breakdown, schedule });
}
