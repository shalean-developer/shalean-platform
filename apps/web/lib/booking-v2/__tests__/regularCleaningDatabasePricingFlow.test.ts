import { describe, expect, it } from "vitest";
import { buildCustomerPricingFromForm } from "@/lib/booking-v2/buildCustomerPricingFromForm";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";
import type { LiveServiceConfig } from "@/lib/booking-v2/bookingV2CatalogTypes";

const databaseCatalog: LiveServiceConfig = {
  slug: "regular-cleaning",
  label: "Regular Cleaning",
  shortLabel: "Regular",
  description: "",
  cleanerMode: "individual_cleaners",
  showEquipmentQuestion: true,
  allowsExtraCleaner: true,
  step1Questions: [],
  basePrice: 350,
  pricePerBedroom: 80,
  pricePerBathroom: 60,
  pricePerExtraRoom: 30,
  pricePerExtraCleaner: 299,
  estimatedDurationHours: 3,
  minDurationHours: 3.5,
  maxDurationHours: 8,
  extras: [],
};

function quote(serviceDetails: Record<string, string>) {
  const feesConfig = defaultBookingV2FeesConfig();
  feesConfig.serviceFeeRule = "flat";
  feesConfig.serviceFeeFlatCents = 3000;
  return buildCustomerPricingFromForm({
    serviceSlug: "regular-cleaning",
    values: {
      serviceDetails,
      selectedExtras: [],
      cleanerMode: "individual_cleaners",
      cleanerCount: 1,
      bookingType: "once_off",
      recurringFrequency: "",
      equipmentRequired: "no",
      equipmentQuote: null,
    },
    liveConfig: databaseCatalog,
    feesConfig,
  });
}

describe("regular cleaning database pricing propagation", () => {
  it("recalculates every room trigger from the database catalog", () => {
    const base = quote({ bedrooms: "0", bathrooms: "0", extraRooms: "0" });
    const bedrooms = quote({ bedrooms: "2", bathrooms: "0", extraRooms: "0" });
    const bathrooms = quote({ bedrooms: "2", bathrooms: "1", extraRooms: "0" });
    const extraRooms = quote({ bedrooms: "2", bathrooms: "1", extraRooms: "1" });

    expect(base.estimated_total).toBe(380);
    expect(bedrooms.estimated_total).toBe(540);
    expect(bathrooms.estimated_total).toBe(600);
    expect(extraRooms.estimated_total).toBe(630);
    expect(extraRooms.lineItems.reduce((sum, line) => sum + line.amountZar, 0)).toBe(630);
  });
});
