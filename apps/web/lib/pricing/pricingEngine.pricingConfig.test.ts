import { describe, it, expect } from "vitest";
import { PRICING_ENGINE_ALGORITHM_VERSION } from "@/lib/pricing/engineVersion";
import type { ServiceTariff } from "@/lib/pricing/pricingConfig";
import { getServiceBaseZarFromSnapshot } from "@/lib/pricing/pricingConfig";
import {
  computeJobSubtotalZarSnapshot,
  estimateJobDurationHoursSnapshot,
  quoteBaseJobZarWithSnapshot,
  quoteCheckoutZarWithSnapshot,
} from "@/lib/pricing/pricingEngineSnapshot";
import { vitestTestPricingRatesSnapshot } from "@/lib/pricing/testPricingSnapshot";

const snap = vitestTestPricingRatesSnapshot();

describe("catalog snapshot + engine", () => {
  it("quoteCheckoutZar echoes algorithm version marker", () => {
    const q = quoteCheckoutZarWithSnapshot(
      snap,
      { service: "standard", rooms: 2, bathrooms: 1, extraRooms: 0, extras: [] },
      "10:00",
      "regular",
      {},
    );
    expect(q.pricingVersion).toBe(PRICING_ENGINE_ALGORITHM_VERSION);
  });

  it("funnel parity: base job anchor matches checkout anchor multipliers for same job", () => {
    const job = { service: "standard" as const, rooms: 2, bathrooms: 1, extraRooms: 1, extras: [] as string[] };
    const base = quoteBaseJobZarWithSnapshot(snap, job);
    const sub = computeJobSubtotalZarSnapshot(snap, job);
    expect(base.totalZar).toBe(sub);
    const checkout = quoteCheckoutZarWithSnapshot(snap, job, "10:00", "regular", { cleanersCount: 1 });
    expect(checkout.subtotalZar).toBe(sub);
  });

  it("subtotal and hours follow per-service tariff only (standard 2bd/1ba)", () => {
    const job = { service: "standard" as const, rooms: 2, bathrooms: 1, extraRooms: 0, extras: [] as string[] };
    const t = snap.services.standard as ServiceTariff;
    expect(computeJobSubtotalZarSnapshot(snap, job)).toBe(t.base + 2 * t.bedroom + 1 * t.bathroom);
    const d = t.duration;
    expect(estimateJobDurationHoursSnapshot(snap, job)).toBe(
      Math.max(2, Math.round((d.base + 2 * d.bedroom + 1 * d.bathroom) * 10) / 10),
    );
  });

  it("getServiceBaseZarFromSnapshot reads tariff base", () => {
    expect(getServiceBaseZarFromSnapshot(snap, "standard")).toBe(snap.services.standard.base);
  });

  it("slot hours match checkout hours for same inputs", () => {
    const job = { service: "deep" as const, rooms: 3, bathrooms: 2, extraRooms: 2, extras: [] as string[] };
    const hQuote = quoteCheckoutZarWithSnapshot(snap, job, "14:00", "regular", { cleanersCount: 2 }).hours;
    const hEstimate = estimateJobDurationHoursSnapshot(snap, job);
    expect(hQuote).toBe(hEstimate);
  });
});
