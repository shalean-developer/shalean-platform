import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { normalizeJobSubtotalSplitZar } from "@/lib/pricing/pricingEngineSnapshot";

describe("normalizeJobSubtotalSplitZar", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSpy.mockRestore();
  });

  it("nudges extras so parts equal subtotalZar", () => {
    const out = normalizeJobSubtotalSplitZar({ serviceBaseZar: 100, roomsZar: 200, extrasZar: 97 }, 400);
    expect(out.serviceBaseZar + out.roomsZar + out.extrasZar).toBe(400);
    expect(out.extrasZar).toBe(100);
  });
});
