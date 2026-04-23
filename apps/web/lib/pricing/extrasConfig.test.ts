import { describe, it, expect } from "vitest";
import {
  computeBundledExtrasTotalZar,
  EXTRAS_CATALOG,
  EXTRAS_DISPLAY_ORDER,
  extrasDisplayOrderResolved,
  filterExtrasForService,
} from "@/lib/pricing/extrasConfig";

describe("extrasConfig display order", () => {
  it("EXTRAS_DISPLAY_ORDER entries exist in catalog", () => {
    for (const id of EXTRAS_DISPLAY_ORDER) {
      expect(EXTRAS_CATALOG[id]).toBeDefined();
    }
    expect(extrasDisplayOrderResolved().length).toBeGreaterThan(0);
  });
});

describe("extrasConfig service scoping", () => {
  it("drops heavy extras when service is standard", () => {
    expect(filterExtrasForService(["carpet-cleaning", "inside-fridge"], "standard")).toEqual(["inside-fridge"]);
  });

  it("applies deep_refresh_bundle for deep service", () => {
    expect(computeBundledExtrasTotalZar(["carpet-cleaning", "mattress-cleaning"], "deep")).toBe(599);
  });

  it("does not charge disallowed extras on standard (tamper-safe)", () => {
    expect(computeBundledExtrasTotalZar(["carpet-cleaning", "inside-oven"], "standard")).toBe(59);
  });
});
