import { describe, expect, it } from "vitest";
import { defaultBookingV2FeesConfig } from "@/lib/booking-v2/bookingV2FeesConfig";
import { calculateCustomerTotal } from "@/lib/booking-v2/calculateCustomerTotal";
import { liveServiceConfigFromPricingSnapshot } from "@/lib/booking-v2/liveServiceConfigFromPricingSnapshot";
import {
  parsePricingRatesSnapshotFromDbRow,
  type PricingRatesSnapshot,
  type PricingSnapshotServiceId,
} from "@/lib/pricing/pricingRatesSnapshot";
import {
  pricingServiceRowToTariff,
} from "@/lib/pricing/buildPricingRatesSnapshotFromDb";
import type { ServiceTariff } from "@/lib/pricing/pricingConfig";

function movingTariff(serviceFeeZar?: number): ServiceTariff {
  return pricingServiceRowToTariff({
    base_price: 1200,
    price_per_bedroom: 120,
    price_per_bathroom: 90,
    price_per_extra_room: 30,
    service_fee_zar: serviceFeeZar ?? null,
    duration_base: 3.5,
    duration_per_bedroom: 0.5,
    duration_per_bathroom: 0.5,
    duration_per_extra_room: 0.3,
    min_hours: 4,
    max_hours: 12,
  });
}

function snapshotWithMove(move: ServiceTariff): PricingRatesSnapshot {
  const services = {} as Record<PricingSnapshotServiceId, ServiceTariff>;
  for (const key of ["standard", "airbnb", "deep", "move", "carpet", "office"] as const) {
    services[key] = key === "move" ? move : {
      base: 250,
      bedroom: 80,
      bathroom: 60,
      extraRoom: 30,
      serviceFeeZar: 30,
      duration: { base: 3.5, bedroom: 0.5, bathroom: 0.5, extraRoom: 0.3 },
      durationLimits: { minHours: 3.5, maxHours: 8 },
    };
  }
  return { codeVersion: 7, services, extras: {}, bundles: [] };
}

describe("Booking V2 service-fee snapshot parity", () => {
  it("freezes and restores Moving Cleaning's R60 service fee", () => {
    const move = movingTariff(60);
    expect(move.serviceFeeZar).toBe(60);

    const snapshot = snapshotWithMove(move);
    const parsed = parsePricingRatesSnapshotFromDbRow({
      code_version: snapshot.codeVersion,
      services: snapshot.services,
      extras: snapshot.extras,
      rules: { bundles: snapshot.bundles },
    });
    expect(parsed?.services.move.serviceFeeZar).toBe(60);

    const feesConfig = defaultBookingV2FeesConfig();
    expect(feesConfig.serviceFeeFlatCents).toBe(3000);

    const live = liveServiceConfigFromPricingSnapshot({
      serviceSlug: "moving-cleaning",
      snapshot: parsed!,
      feesConfig,
    });
    expect(live?.serviceFeeZar).toBe(60);

    const pricing = calculateCustomerTotal({
      serviceSlug: "moving-cleaning",
      serviceLabel: "Moving Cleaning",
      serviceDetails: {
        propertyType: "apartment",
        moveType: "move_in",
        bedrooms: "2",
        bathrooms: "3",
        extraRooms: "0",
        furnished: "no",
        hasPets: "no",
      },
      selectedExtras: [],
      cleanerMode: "team",
      cleanerCount: 1,
      bookingType: "once_off",
      recurringFrequency: "",
      catalog: live!,
      feesConfig,
    });

    expect(pricing.base_service_price).toBe(1200);
    expect(pricing.bedrooms_price).toBe(240);
    expect(pricing.bathrooms_price).toBe(270);
    expect(pricing.service_fee).toBe(60);
    expect(pricing.estimated_total).toBe(1770);
  });

  it("keeps historical snapshots without serviceFeeZar readable", () => {
    const historical = snapshotWithMove(movingTariff());
    const parsed = parsePricingRatesSnapshotFromDbRow({
      code_version: historical.codeVersion,
      services: historical.services,
      extras: historical.extras,
      rules: { bundles: historical.bundles },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.services.move.serviceFeeZar).toBeUndefined();
  });
});
