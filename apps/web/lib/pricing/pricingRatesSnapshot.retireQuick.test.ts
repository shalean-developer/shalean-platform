import { describe, expect, it } from "vitest";
import { parsePricingRatesSnapshotFromDbRow } from "@/lib/pricing/pricingRatesSnapshot";
import type { ServiceTariff } from "@/lib/pricing/pricingConfig";

const tariff = (): ServiceTariff => ({
  base: 100,
  bedroom: 10,
  bathroom: 10,
  extraRoom: 5,
  duration: { base: 2, bedroom: 0.5, bathroom: 0.5, extraRoom: 0.25 },
});

describe("pricing snapshot active services", () => {
  it("hydrates only current bookable service keys and filters quick from eligibility", () => {
    const snapshot = parsePricingRatesSnapshotFromDbRow({
      code_version: 1,
      services: {
        standard: tariff(),
        airbnb: tariff(),
        deep: tariff(),
        move: tariff(),
        carpet: tariff(),
        quick: tariff(),
      },
      extras: {
        "inside-fridge": { price: 50, services: ["standard", "quick", "airbnb"] },
      },
      rules: {
        bundles: [
          { id: "kitchen", items: ["inside-fridge"], price: 45, services: ["standard", "quick"] },
        ],
      },
    });

    expect(snapshot).not.toBeNull();
    expect(Object.keys(snapshot!.services)).toEqual(["standard", "airbnb", "deep", "move", "carpet"]);
    expect(snapshot!.extras["inside-fridge"]!.services).toEqual(["standard", "airbnb"]);
    expect(snapshot!.bundles[0]!.services).toEqual(["standard"]);
  });
});
