import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  parseStoredPriceBreakdown,
  priceLinesFromStoredCheckoutQuote,
} from "@/lib/dashboard/storedPriceBreakdown";

const minimalQuote = {
  totalZar: 950,
  subtotalZar: 800,
  afterVipSubtotalZar: 760,
  vipSavingsZar: 40,
  vipSubtotalMultiplier: 0.95,
  hours: 3.5,
  vipDiscountRate: 0.05,
  timeBandMultiplier: 1,
  demandTierMultiplier: 1,
  slotCoreMultiplier: 1.25,
  dynamicAdjustment: 1,
  effectiveSurgeMultiplier: 1.25,
  tier: "regular",
  demandLabel: "standard",
  surgeLabel: "Peak window",
  extraRoomsNormalized: 0,
  extraRoomsChargeZar: 0,
  pricingVersion: 6,
};

describe("storedPriceBreakdown", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSpy.mockRestore();
  });

  it("parses persisted checkout JSON", () => {
    const q = parseStoredPriceBreakdown(minimalQuote);
    expect(q).not.toBeNull();
    expect(q!.totalZar).toBe(950);
    expect(q!.subtotalZar).toBe(800);
  });

  it("line items sum to locked total when VIP savings present", () => {
    const q = parseStoredPriceBreakdown(minimalQuote)!;
    const lines = priceLinesFromStoredCheckoutQuote(q, 950, null, null);
    expect(lines[0]?.kind).toBe("job_combined");
    const sum = lines.reduce((s, l) => s + l.amountZar, 0);
    expect(sum).toBe(950);
  });

  it("splits job subtotal when persisted job lines match subtotal", () => {
    const payload = {
      ...minimalQuote,
      job: { serviceBaseZar: 500, roomsZar: 200, extrasZar: 100 },
    };
    const q = parseStoredPriceBreakdown(payload)!;
    const lines = priceLinesFromStoredCheckoutQuote(q, 950, { serviceBaseZar: 500, roomsZar: 200, extrasZar: 100 });
    expect(lines.slice(0, 3).map((l) => l.kind)).toEqual(["job_service", "job_rooms", "job_extras"]);
    expect(lines.slice(0, 3).map((l) => l.label)).toEqual(["Service base", "Rooms", "Extras"]);
    expect(lines.some((l) => l.label.includes("After VIP"))).toBe(true);
    const sum = lines.reduce((s, l) => s + l.amountZar, 0);
    expect(sum).toBe(950);
  });

  it("aligns 1 ZAR drift on job parts then splits", () => {
    const payload = { ...minimalQuote, job: { serviceBaseZar: 500, roomsZar: 200, extrasZar: 99 } };
    const q = parseStoredPriceBreakdown(payload)!;
    const lines = priceLinesFromStoredCheckoutQuote(q, 950, { serviceBaseZar: 500, roomsZar: 200, extrasZar: 99 }, null);
    expect(lines[2]).toMatchObject({ kind: "job_extras", amountZar: 100 });
  });

  it("falls back to combined job line when job sum mismatches subtotal", () => {
    const q = parseStoredPriceBreakdown(minimalQuote)!;
    const lines = priceLinesFromStoredCheckoutQuote(q, 950, { serviceBaseZar: 100, roomsZar: 100, extrasZar: 100 }, null);
    expect(lines[0]?.kind).toBe("job_combined");
    expect(lines[0]?.label).toBe("Job subtotal (service, rooms & add-ons)");
  });

  it("falls back when a single job part exceeds subtotal (skew guard)", () => {
    const payload = {
      ...minimalQuote,
      subtotalZar: 800,
      job: { serviceBaseZar: 801, roomsZar: 0, extrasZar: 0 },
    };
    const q = parseStoredPriceBreakdown(payload)!;
    const lines = priceLinesFromStoredCheckoutQuote(q, 950, { serviceBaseZar: 801, roomsZar: 0, extrasZar: 0 }, null);
    expect(lines[0]?.kind).toBe("job_combined");
  });
});
