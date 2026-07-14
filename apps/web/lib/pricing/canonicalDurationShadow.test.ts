import { describe, expect, it } from "vitest";
import {
  buildCanonicalDurationShadowDiagnostics,
  classifyCanonicalDurationDelta,
  isLargeCanonicalDurationMismatch,
} from "@/lib/pricing/canonicalDurationShadow";
import {
  estimateLegacyTariffDurationHoursSnapshot,
  quoteCheckoutZarWithSnapshot,
} from "@/lib/pricing/pricingEngineSnapshot";
import { vitestTestPricingRatesSnapshot } from "@/lib/pricing/testPricingSnapshot";

const snap = vitestTestPricingRatesSnapshot();

describe("canonical duration shadow diagnostics (Phase 2D-A)", () => {
  it("classifies delta severity", () => {
    expect(classifyCanonicalDurationDelta(0)).toBe("parity");
    expect(classifyCanonicalDurationDelta(15)).toBe("parity");
    expect(classifyCanonicalDurationDelta(16)).toBe("low");
    expect(classifyCanonicalDurationDelta(30)).toBe("low");
    expect(classifyCanonicalDurationDelta(31)).toBe("medium");
    expect(classifyCanonicalDurationDelta(60)).toBe("medium");
    expect(classifyCanonicalDurationDelta(61)).toBe("high");
    expect(classifyCanonicalDurationDelta(120)).toBe("high");
    expect(classifyCanonicalDurationDelta(121)).toBe("critical");
    expect(isLargeCanonicalDurationMismatch("medium")).toBe(false);
    expect(isLargeCanonicalDurationMismatch("high")).toBe(true);
    expect(isLargeCanonicalDurationMismatch("critical")).toBe(true);
  });

  it("attaches shadow diagnostics while quote hours follow the unified duration axis", () => {
    const job = { service: "standard" as const, rooms: 2, bathrooms: 1, extraRooms: 0, extras: [] as string[] };
    const quoted = quoteCheckoutZarWithSnapshot(snap, job, "10:00", "regular", { cleanersCount: 1 });
    const legacyTariffHours = estimateLegacyTariffDurationHoursSnapshot(snap, job);

    // Quote money hours use the unified/canonical duration axis (not legacy tariff hours).
    expect(quoted.hours).toBe(4.5);
    expect(legacyTariffHours).toBe(2.7);
    expect(quoted.durationDiagnostics).toMatchObject({
      mode: "shadow",
      canonical_duration_minutes: 270,
      // Runtime quote hours are fed as the shadow "legacyHours" input after unified adoption.
      legacy_duration_minutes: 270,
      delta_minutes: 0,
      delta_severity: "parity",
    });
  });

  it("keeps shadow parity when canonical and legacy minutes match", () => {
    const diagnostics = buildCanonicalDurationShadowDiagnostics({
      job: { service: "standard", rooms: 2, bathrooms: 1, extraRooms: 0, extras: [] },
      legacyHours: 4.5,
    });

    expect(diagnostics.legacy_duration_minutes).toBe(270);
    expect(diagnostics.canonical_duration_minutes).toBe(270);
    expect(diagnostics.delta_minutes).toBe(0);
    expect(diagnostics.delta_severity).toBe("parity");
  });

  it("surfaces extras-heavy jobs with elevated complexity on the unified hours axis", () => {
    const job = {
      service: "standard" as const,
      rooms: 2,
      bathrooms: 1,
      extraRooms: 0,
      extras: ["inside-oven", "inside-fridge", "inside-cabinets", "interior-walls"],
    };
    const quoted = quoteCheckoutZarWithSnapshot(snap, job, "10:00", "regular", { cleanersCount: 1 });
    const legacyTariffHours = estimateLegacyTariffDurationHoursSnapshot(snap, job);

    expect(quoted.hours).toBe(7.3);
    expect(legacyTariffHours).toBe(2.7);
    expect(quoted.durationDiagnostics).toMatchObject({
      canonical_duration_minutes: 435,
      operational_complexity: "elevated",
    });
    expect(quoted.hours).toBeGreaterThan(legacyTariffHours);
  });

  it("flags large-property jobs with guards in shadow diagnostics", () => {
    const diagnostics = buildCanonicalDurationShadowDiagnostics({
      job: {
        service: "deep",
        rooms: 12,
        bathrooms: 7,
        extraRooms: 9,
        extras: ["interior-walls", "garage-cleaning", "outside-windows"],
      },
      legacyHours: 10,
    });

    expect(diagnostics.operational_complexity).toBe("large_property");
    expect(diagnostics.guards).toEqual(expect.arrayContaining(["large_property", "max_duration_clamped"]));
    expect(diagnostics.canonical_duration_minutes).toBe(540);
  });

  it("captures Deep, Move, and Carpet duration deltas", () => {
    for (const service of ["deep", "move", "carpet"] as const) {
      const diagnostics = buildCanonicalDurationShadowDiagnostics({
        job: { service, rooms: 3, bathrooms: 2, extraRooms: 1, extras: [] },
        legacyHours: 3.05,
      });

      expect(diagnostics.abs_delta_minutes, service).toBeGreaterThan(0);
      expect(diagnostics.delta_severity, service).not.toBe("parity");
      expect(diagnostics.workload_weight, service).toBeGreaterThan(1);
    }
  });

  it("reports recurring snapshot compatibility without affecting runtime hours", () => {
    const compatible = buildCanonicalDurationShadowDiagnostics({
      job: { service: "standard", rooms: 2, bathrooms: 1, extraRooms: 0, extras: [] },
      legacyHours: 2.7,
      recurringSnapshotDurationMinutes: 260,
    });
    const drifted = buildCanonicalDurationShadowDiagnostics({
      job: { service: "standard", rooms: 2, bathrooms: 1, extraRooms: 0, extras: [] },
      legacyHours: 2.7,
      recurringSnapshotDurationMinutes: 180,
    });

    expect(compatible.recurring_snapshot_compatible).toBe(true);
    expect(compatible.recurring_snapshot_delta_minutes).toBe(-10);
    expect(drifted.recurring_snapshot_compatible).toBe(false);
    expect(drifted.guards).toContain("recurring_snapshot_duration_drift");
  });
});
