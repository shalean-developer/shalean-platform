import { describe, expect, it } from "vitest";
import {
  serviceIncludesShaleanSupplies,
  serviceRequiresCustomerEquipmentChoice,
  serviceSuppliesPolicy,
} from "@/lib/booking-v2/serviceSuppliesPolicy";
import { buildDefaultBookingV2CatalogConfig } from "@/lib/booking-v2/bookingV2ServiceDefinitions";
import { liveServiceConfigFromPricingSnapshot } from "@/lib/booking-v2/liveServiceConfigFromPricingSnapshot";
import { calculateCustomerTotal } from "@/lib/booking-v2/calculateCustomerTotal";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";

describe("serviceSuppliesPolicy", () => {
  it("requires a customer equipment choice only for Regular", () => {
    expect(serviceSuppliesPolicy("regular-cleaning")).toBe("customer_or_shalean_logistics");
    expect(serviceRequiresCustomerEquipmentChoice("regular-cleaning")).toBe(true);
  });

  it("includes Shalean supplies for Deep, Moving and Airbnb", () => {
    expect(serviceSuppliesPolicy("deep-cleaning")).toBe("shalean_included");
    expect(serviceSuppliesPolicy("moving-cleaning")).toBe("shalean_included");
    expect(serviceSuppliesPolicy("airbnb-cleaning")).toBe("shalean_included");
    expect(serviceIncludesShaleanSupplies("deep-cleaning")).toBe(true);
    expect(serviceIncludesShaleanSupplies("moving-cleaning")).toBe(true);
    expect(serviceIncludesShaleanSupplies("airbnb-cleaning")).toBe(true);
    expect(serviceRequiresCustomerEquipmentChoice("deep-cleaning")).toBe(false);
    expect(serviceRequiresCustomerEquipmentChoice("moving-cleaning")).toBe(false);
    expect(serviceRequiresCustomerEquipmentChoice("airbnb-cleaning")).toBe(false);
  });

  it("keeps Office and Carpet unresolved instead of inventing a policy", () => {
    expect(serviceSuppliesPolicy("office-cleaning")).toBe("unresolved");
    expect(serviceSuppliesPolicy("carpet-cleaning")).toBe("unresolved");
    expect(serviceRequiresCustomerEquipmentChoice("office-cleaning")).toBe(false);
    expect(serviceRequiresCustomerEquipmentChoice("carpet-cleaning")).toBe(false);
  });

  it("propagates the policy into the default booking catalog", () => {
    const config = buildDefaultBookingV2CatalogConfig();
    const bySlug = Object.fromEntries(config.services.map((service) => [service.slug, service]));

    expect(bySlug["regular-cleaning"]?.showEquipmentQuestion).toBe(true);
    expect(bySlug["airbnb-cleaning"]?.showEquipmentQuestion).toBe(false);
    expect(bySlug["deep-cleaning"]?.showEquipmentQuestion).toBe(false);
    expect(bySlug["moving-cleaning"]?.showEquipmentQuestion).toBe(false);
    expect(bySlug["office-cleaning"]?.showEquipmentQuestion).toBe(false);
    expect(bySlug["carpet-cleaning"]?.showEquipmentQuestion).toBe(false);
  });
  it("preserves Regular equipment logistics when rehydrating a frozen pricing version", () => {
    const tariff = {
      base: 250,
      bedroom: 80,
      bathroom: 60,
      extraRoom: 30,
      duration: { base: 3.5, bedroom: 0.5, bathroom: 0.5, extraRoom: 0.3 },
      durationLimits: { minHours: 2, maxHours: 8 },
    };
    const snapshot: PricingRatesSnapshot = {
      codeVersion: 1,
      services: {
        standard: tariff,
        airbnb: tariff,
        deep: tariff,
        move: tariff,
        carpet: tariff,
        office: tariff,
      },
      extras: {
        laundry: { price: 35, services: ["standard"], name: "Laundry" },
        "inside-oven": { price: 20, services: ["standard"], name: "Inside oven" },
      },
      bundles: [],
    };
    const feesConfig = defaultBookingV2FeesConfig();
    const config = liveServiceConfigFromPricingSnapshot({
      serviceSlug: "regular-cleaning",
      snapshot,
      feesConfig,
    });
    expect(config?.showEquipmentQuestion).toBe(true);

    const total = calculateCustomerTotal({
      serviceSlug: "regular-cleaning",
      serviceLabel: "Regular Cleaning",
      serviceDetails: { bedrooms: "2", bathrooms: "2", extraRooms: "2" },
      selectedExtras: ["laundry", "inside-oven"],
      cleanerMode: "individual_cleaners",
      cleanerCount: 1,
      bookingType: "once_off",
      recurringFrequency: "",
      equipmentRequired: true,
      equipmentQuote: {
        base_fee: 450,
        distance_km: 3.4,
        price_per_km: 25,
        base_location: "Shalean Equipment Base, Cape Town",
        logistics_fee: 535,
        distance_charge: 85,
        distance_source: "suburb_centroid",
        customer_latitude: -33.967,
        customer_longitude: 18.504,
        manual_quote_required: false,
        manual_quote_message: "",
      },
      catalog: config!,
      feesConfig,
      vipTier: "regular",
    });

    expect(total.cleaning_service_subtotal).toBe(645);
    expect(total.equipment_logistics_fee).toBe(535);
    expect(total.service_fee).toBe(30);
    expect(total.estimated_total).toBe(1210);
  });

});
