import { describe, expect, it } from "vitest";
import {
  cleanerPassesServiceCapabilityGate,
  countCleanersPassingServiceCapabilityGate,
  serviceCapabilityGateFromBookingFields,
} from "@/lib/booking/serviceCapabilityEligibility";

describe("serviceCapabilityGateFromBookingFields", () => {
  it("maps catalog slugs", () => {
    expect(serviceCapabilityGateFromBookingFields("deep", null)).toBe("deep");
    expect(serviceCapabilityGateFromBookingFields("move", null)).toBe("move");
  });

  it("falls back to labels when slug missing", () => {
    expect(serviceCapabilityGateFromBookingFields(null, "Deep Cleaning")).toBe("deep");
    expect(serviceCapabilityGateFromBookingFields(null, "Move In/Out Cleaning")).toBe("move");
  });

  it("returns null for standard-style jobs", () => {
    expect(serviceCapabilityGateFromBookingFields("standard", null)).toBe(null);
    expect(serviceCapabilityGateFromBookingFields(null, "Standard Cleaning")).toBe(null);
  });
});

describe("cleanerPassesServiceCapabilityGate", () => {
  it("allows all cleaners when gate is null", () => {
    expect(cleanerPassesServiceCapabilityGate({ can_do_deep_cleaning: false }, null)).toBe(true);
  });

  it("requires explicit true-ish capability when gated", () => {
    expect(cleanerPassesServiceCapabilityGate({ can_do_deep_cleaning: true }, "deep")).toBe(true);
    expect(cleanerPassesServiceCapabilityGate({ can_do_deep_cleaning: false }, "deep")).toBe(false);
    expect(cleanerPassesServiceCapabilityGate({}, "deep")).toBe(true);
    expect(cleanerPassesServiceCapabilityGate({ can_do_move_cleaning: false }, "move")).toBe(false);
  });
});

describe("countCleanersPassingServiceCapabilityGate", () => {
  it("returns full length when gate is null", () => {
    const m = new Map([["a", { can_do_deep_cleaning: false }]]);
    expect(countCleanersPassingServiceCapabilityGate(["a", "b"], m, null)).toBe(2);
  });

  it("counts only cleaners that pass the gate", () => {
    const m = new Map<string, { can_do_move_cleaning?: boolean | null }>([
      ["a", { can_do_move_cleaning: true }],
      ["b", { can_do_move_cleaning: false }],
      ["c", {}],
    ]);
    expect(countCleanersPassingServiceCapabilityGate(["a", "b", "c"], m, "move")).toBe(2);
  });
});
