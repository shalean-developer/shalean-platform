/**
 * Explicit booking-v2 service pricing contract (Princess PRA2).
 * Every visible Step-1 field is classified so none remain silently ignored.
 */

import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";

/** Field effect classification for the pricing matrix. */
export type PricingFieldEffect =
  | "price_and_duration"
  | "duration_only"
  | "informational"
  | "extras_or_remove";

export type ServicePricingFieldContract = {
  key: string;
  effect: PricingFieldEffect;
  /** Quote / duration engine consumption note. */
  consumedBy: string;
};

export type CanonicalPricingKey =
  | "standard"
  | "deep"
  | "move"
  | "move-in"
  | "move-out"
  | "office"
  | "carpet"
  | "airbnb";

export type ServicePricingContract = {
  bookingV2Slug: ServiceSlug;
  /** Default pricing_services lookup key (before moveType / aliases). */
  canonicalPricingKey: CanonicalPricingKey;
  aliases: readonly string[];
  fields: readonly ServicePricingFieldContract[];
};

/**
 * Office recurrence ownership:
 * Booking frequency is selected in Step 2 using bookingType + recurringFrequency.
 * The retired Step-1 serviceDetails.frequency field never affected per-visit pricing.
 */

export const SERVICE_PRICING_CONTRACTS: Record<ServiceSlug, ServicePricingContract> = {
  "regular-cleaning": {
    bookingV2Slug: "regular-cleaning",
    canonicalPricingKey: "standard",
    aliases: ["standard", "standard-cleaning", "regular", "regular-cleaning"],
    fields: [
      { key: "propertyType", effect: "price_and_duration", consumedBy: "propertyFactorRates.propertyType (default 0)" },
      { key: "bedrooms", effect: "price_and_duration", consumedBy: "catalog.pricePerBedroom + duration rooms" },
      { key: "bathrooms", effect: "price_and_duration", consumedBy: "catalog.pricePerBathroom + duration bathrooms" },
      { key: "extraRooms", effect: "price_and_duration", consumedBy: "catalog.pricePerExtraRoom + duration extraRooms" },
      { key: "hasPets", effect: "informational", consumedBy: "persisted in serviceDetails only" },
    ],
  },
  "deep-cleaning": {
    bookingV2Slug: "deep-cleaning",
    canonicalPricingKey: "deep",
    aliases: ["deep", "deep-cleaning"],
    fields: [
      { key: "propertyType", effect: "price_and_duration", consumedBy: "propertyFactorRates.propertyType" },
      { key: "bedrooms", effect: "price_and_duration", consumedBy: "catalog room rates + duration" },
      { key: "bathrooms", effect: "price_and_duration", consumedBy: "catalog room rates + duration" },
      { key: "extraRooms", effect: "price_and_duration", consumedBy: "catalog room rates + duration" },
      { key: "lastCleaned", effect: "price_and_duration", consumedBy: "propertyFactorRates.lastCleaned" },
      { key: "hasPets", effect: "informational", consumedBy: "persisted only" },
    ],
  },
  "moving-cleaning": {
    bookingV2Slug: "moving-cleaning",
    canonicalPricingKey: "move",
    aliases: ["move", "move-in", "move-out", "moving", "moving-cleaning", "moving-in-cleaning"],
    fields: [
      { key: "propertyType", effect: "price_and_duration", consumedBy: "propertyFactorRates.propertyType" },
      {
        key: "moveType",
        effect: "price_and_duration",
        consumedBy: "selects move-in vs move-out pricing row when present; else shared move",
      },
      { key: "bedrooms", effect: "price_and_duration", consumedBy: "catalog room rates + duration" },
      { key: "bathrooms", effect: "price_and_duration", consumedBy: "catalog room rates + duration" },
      { key: "extraRooms", effect: "price_and_duration", consumedBy: "catalog room rates + duration" },
      { key: "furnished", effect: "price_and_duration", consumedBy: "propertyFactorRates.furnished" },
      { key: "hasPets", effect: "informational", consumedBy: "persisted in serviceDetails only" },
    ],
  },
  "office-cleaning": {
    bookingV2Slug: "office-cleaning",
    canonicalPricingKey: "office",
    aliases: ["office", "office-cleaning", "quick"],
    fields: [
      { key: "officeSize", effect: "price_and_duration", consumedBy: "propertyFactorRates.officeSize + duration proxy rooms" },
      { key: "bathrooms", effect: "price_and_duration", consumedBy: "catalog.pricePerBathroom + duration" },
    ],
  },
  "carpet-cleaning": {
    bookingV2Slug: "carpet-cleaning",
    canonicalPricingKey: "carpet",
    aliases: ["carpet", "carpet-cleaning"],
    fields: [
      { key: "propertyType", effect: "price_and_duration", consumedBy: "propertyFactorRates.propertyType" },
      { key: "carpetRooms", effect: "price_and_duration", consumedBy: "carpetRooms_per_room_zar or pricePerBedroom + duration" },
      { key: "rugCount", effect: "price_and_duration", consumedBy: "rugs_per_unit_zar + duration rug minutes" },
      { key: "carpetType", effect: "price_and_duration", consumedBy: "propertyFactorRates.carpetType" },
      { key: "stains", effect: "price_and_duration", consumedBy: "propertyFactorRates.stains" },
    ],
  },
  "airbnb-cleaning": {
    bookingV2Slug: "airbnb-cleaning",
    canonicalPricingKey: "airbnb",
    aliases: ["airbnb", "airbnb-cleaning"],
    fields: [
      { key: "propertyType", effect: "price_and_duration", consumedBy: "propertyFactorRates.propertyType" },
      { key: "bedrooms", effect: "price_and_duration", consumedBy: "catalog room rates + duration" },
      { key: "bathrooms", effect: "price_and_duration", consumedBy: "catalog room rates + duration" },
      { key: "extraRooms", effect: "price_and_duration", consumedBy: "catalog room rates + duration" },
      { key: "linens", effect: "informational", consumedBy: "ops; laundry Extra remains distinct" },
      { key: "keyAccess", effect: "informational", consumedBy: "access logistics" },
    ],
  },
};

/** Pricing-relevant fields that must appear in quote factor lines or be explicitly informational. */
export function pricingRelevantFieldKeys(serviceSlug: ServiceSlug): string[] {
  return SERVICE_PRICING_CONTRACTS[serviceSlug].fields
    .filter((f) => f.effect === "price_and_duration" || f.effect === "duration_only")
    .map((f) => f.key);
}

export function informationalFieldKeys(serviceSlug: ServiceSlug): string[] {
  return SERVICE_PRICING_CONTRACTS[serviceSlug].fields
    .filter((f) => f.effect === "informational")
    .map((f) => f.key);
}
