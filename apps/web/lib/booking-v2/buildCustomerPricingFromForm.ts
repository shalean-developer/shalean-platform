import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";
import type { BookingV2FormData } from "@/src/features/booking-v2/types";
import { calculateCustomerTotal } from "@/lib/booking-v2/calculateCustomerTotal";
import type { BookingV2FeesConfig, CustomerPricingBreakdown } from "@/lib/booking-v2/types";
import type { LiveServiceConfig } from "@/lib/booking-v2/bookingV2CatalogTypes";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";

export function buildCustomerPricingFromForm(params: {
  serviceSlug: BookingV2FormData["serviceSlug"];
  values: Pick<
    BookingV2FormData,
    | "serviceDetails"
    | "selectedExtras"
    | "cleanerMode"
    | "cleanerCount"
    | "bookingType"
    | "recurringFrequency"
  >;
  liveConfig: LiveServiceConfig | null;
  feesConfig: BookingV2FeesConfig | null;
}): CustomerPricingBreakdown {
  const { serviceSlug, values, liveConfig, feesConfig } = params;
  const staticConfig = SERVICE_CONFIG[serviceSlug];

  const catalogSource: LiveServiceConfig =
    liveConfig ?? {
      slug: serviceSlug,
      label: staticConfig.label,
      shortLabel: staticConfig.shortLabel,
      description: staticConfig.description,
      cleanerMode: staticConfig.cleanerMode,
      showCleaningProductsQuestion: serviceSlug !== "deep-cleaning" && serviceSlug !== "moving-cleaning",
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
      extras: [],
    };

  return calculateCustomerTotal({
    serviceSlug,
    serviceLabel: catalogSource.label,
    serviceDetails: values.serviceDetails ?? {},
    selectedExtras: values.selectedExtras ?? [],
    cleanerMode: values.cleanerMode,
    cleanerCount: values.cleanerCount ?? 1,
    bookingType: values.bookingType,
    recurringFrequency: values.recurringFrequency ?? "",
    catalog: {
      basePrice: catalogSource.basePrice,
      pricePerBedroom: catalogSource.pricePerBedroom,
      pricePerBathroom: catalogSource.pricePerBathroom,
      pricePerExtraRoom: catalogSource.pricePerExtraRoom,
      pricePerExtraCleaner: catalogSource.pricePerExtraCleaner,
      estimatedDurationHours: catalogSource.estimatedDurationHours,
      extras: catalogSource.extras,
      allowsExtraCleaner: catalogSource.allowsExtraCleaner,
      showCleaningProductsQuestion: catalogSource.showCleaningProductsQuestion,
    },
    feesConfig: feesConfig ?? defaultBookingV2FeesConfig(),
  });
}

export function pricingPersistFields(breakdown: CustomerPricingBreakdown) {
  return {
    pricing_summary: breakdown,
    total_paid_zar: breakdown.estimated_total,
    amount_paid_cents: Math.round(breakdown.estimated_total * 100),
    service_fee_cents: Math.round(breakdown.service_fee * 100),
    base_amount_cents: Math.round(breakdown.subtotal_before_service_fee * 100),
    recurring_discount_cents: Math.round(breakdown.recurring_discount * 100),
    estimated_duration_minutes: breakdown.estimated_duration_minutes,
  };
}
