import { describe, it, expect } from "vitest";
import { PRICING_CONFIG, tariffForPricingService } from "@/lib/pricing/pricingConfig";
import {
  computeJobSubtotalZar,
  estimateJobDurationHours,
  quoteBaseJobZar,
  quoteCheckoutZar,
} from "@/lib/pricing/pricingEngine";

describe("PRICING_CONFIG + engine", () => {
  it("quoteCheckoutZar echoes tariff version", () => {
    const q = quoteCheckoutZar(
      { service: "standard", rooms: 2, bathrooms: 1, extraRooms: 0, extras: [] },
      "10:00",
      "regular",
      {},
    );
    expect(q.pricingVersion).toBe(PRICING_CONFIG.version);
  });

  it("funnel parity: base job anchor matches checkout anchor multipliers for same job", () => {
    const job = { service: "standard" as const, rooms: 2, bathrooms: 1, extraRooms: 1, extras: [] as string[] };
    const base = quoteBaseJobZar(job);
    const sub = computeJobSubtotalZar(job);
    expect(base.totalZar).toBe(sub);
    const checkout = quoteCheckoutZar(job, "10:00", "regular", { cleanersCount: 1 });
    expect(checkout.subtotalZar).toBe(sub);
  });

  it("subtotal and hours follow per-service tariff only (standard 2bd/1ba)", () => {
    const job = { service: "standard" as const, rooms: 2, bathrooms: 1, extraRooms: 0, extras: [] as string[] };
    const t = tariffForPricingService("standard");
    expect(computeJobSubtotalZar(job)).toBe(t.base + 2 * t.bedroom + 1 * t.bathroom);
    const d = t.duration;
    expect(estimateJobDurationHours(job)).toBe(
      Math.max(2, Math.round((d.base + 2 * d.bedroom + 1 * d.bathroom) * 10) / 10),
    );
  });

  it("slot hours match checkout hours for same inputs", () => {
    const job = { service: "deep" as const, rooms: 3, bathrooms: 2, extraRooms: 2, extras: [] as string[] };
    const hQuote = quoteCheckoutZar(job, "14:00", "regular", { cleanersCount: 2 }).hours;
    const hEstimate = estimateJobDurationHours(job);
    expect(hQuote).toBe(hEstimate);
  });
});
