import { describe, it, expect } from "vitest";
import {
  BOOKING_EXTRA_ID_SET,
  extrasDisplayOrderResolved,
  filterExtrasForService,
} from "@/lib/pricing/extrasConfig";
import { computeBundledExtrasTotalZarSnapshot } from "@/lib/pricing/pricingEngineSnapshot";
import { vitestTestPricingRatesSnapshot } from "@/lib/pricing/testPricingSnapshot";

const snap = vitestTestPricingRatesSnapshot();

describe("extrasConfig display order", () => {
  it("BOOKING_EXTRA_ID_SET includes core slugs", () => {
    expect(BOOKING_EXTRA_ID_SET.has("inside-oven")).toBe(true);
    expect(BOOKING_EXTRA_ID_SET.has("inside-fridge")).toBe(true);
  });

  it("extrasDisplayOrderResolved preserves caller order", () => {
    const ordered = ["inside-fridge", "inside-oven"];
    expect(extrasDisplayOrderResolved(ordered)).toEqual(["inside-fridge", "inside-oven"]);
  });
});

describe("extrasConfig service scoping", () => {
  it("drops heavy extras when service is standard", () => {
    expect(filterExtrasForService(["carpet-cleaning", "inside-fridge"], "standard", snap)).toEqual(["inside-fridge"]);
  });

  it("applies deep_refresh_bundle for deep service", () => {
    expect(computeBundledExtrasTotalZarSnapshot(snap, ["carpet-cleaning", "mattress-cleaning"], "deep")).toBe(599);
  });

  it("does not charge disallowed extras on standard (tamper-safe)", () => {
    expect(computeBundledExtrasTotalZarSnapshot(snap, ["carpet-cleaning", "inside-oven"], "standard")).toBe(59);
  });
});
