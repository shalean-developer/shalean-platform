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
 * Office frequency model (approved for PRA2):
 * C — frequency records recurring commitment / ops preference only;
 * it does not change the per-visit price. Recurring discounts come only from
 * Step 2 bookingType + recurringFrequency when the customer chooses a plan.
 */
export const OFFICE_FREQUENCY_MODEL = "C" as const;
export const OFFICE_FREQUENCY_UI_HINT =
  "How often you need cleaning — this does not change today’s visit price. Choose a recurring plan on the schedule step if you want a plan discount.";

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
      { key: "specialInstructions", effect: "informational", consumedBy: "persisted notes" },
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
      { key: "specialInstructions", effect: "informational", consumedBy: "persisted notes" },
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
      { key: "depositInspection", effect: "informational", consumedBy: "ops hint; deposit-preparation is an Extra" },
      { key: "specialInstructions", effect: "informational", consumedBy: "persisted notes" },
    ],
  },
  "office-cleaning": {
    bookingV2Slug: "office-cleaning",
    canonicalPricingKey: "office",
    aliases: ["office", "office-cleaning", "quick"],
    fields: [
      { key: "officeType", effect: "informational", consumedBy: "persisted for ops" },
      { key: "officeSize", effect: "price_and_duration", consumedBy: "propertyFactorRates.officeSize + duration proxy rooms" },
      { key: "bathrooms", effect: "price_and_duration", consumedBy: "catalog.pricePerBathroom + duration" },
      {
        key: "frequency",
        effect: "informational",
        consumedBy: `Model ${OFFICE_FREQUENCY_MODEL}: commitment only — no per-visit price change`,
      },
      { key: "afterHours", effect: "informational", consumedBy: "persisted scheduling preference" },
      { key: "specialInstructions", effect: "informational", consumedBy: "persisted notes" },
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
      {
        key: "sofaCount",
        effect: "extras_or_remove",
        consumedBy: "legacy: priced if present; new bookings use sofa-upholstery Extra",
      },
      { key: "hasPets", effect: "informational", consumedBy: "persisted only" },
      { key: "specialInstructions", effect: "informational", consumedBy: "persisted notes" },
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
      { key: "guestCheckout", effect: "informational", consumedBy: "scheduling logistics" },
      { key: "keyAccess", effect: "informational", consumedBy: "access logistics" },
      { key: "welcomeBasket", effect: "informational", consumedBy: "ops; welcome-setup Extra distinct" },
      { key: "specialInstructions", effect: "informational", consumedBy: "persisted notes" },
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
