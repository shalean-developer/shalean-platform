import { describe, it, expect } from "vitest";
import { predictConversionProbability } from "@/lib/ai-autonomy/predictions";
import { predictCleanerAcceptanceSync } from "@/lib/ai-autonomy/predictions";
import { optimizeDecision } from "@/lib/ai-autonomy/optimizeDecision";
import { assignExperimentVariant } from "@/lib/ai-autonomy/experiments";
import { calculateDynamicPrice } from "@/lib/marketplace-intelligence/dynamicPricing";
import type { AssignmentWeights } from "@/lib/ai-autonomy/modelWeights";

describe("predictConversionProbability", () => {
  it("returns bounded probability without supabase", async () => {
    const r = await predictConversionProbability(
      { segment: "loyal", price: 1500, hourOfDay: 14, dayOfWeek: 2, channel: "web" },
      null,
    );
    expect(r.probability).toBeGreaterThanOrEqual(0.05);
    expect(r.probability).toBeLessThanOrEqual(0.95);
  });
});

describe("predictCleanerAcceptanceSync", () => {
  it("blends base model with EMA weights", () => {
    const w: AssignmentWeights = { acceptanceBlend: 1, miScoreBlend: 1, emaBlend: 1 };
    const r = predictCleanerAcceptanceSync(
      {
        cleaner: {
          id: "x",
          distanceKm: 2,
          acceptanceRecent: 0.9,
          acceptanceLifetime: 0.85,
          recentDeclines: 0,
          fatigueOffersLastHour: 0,
          outcomeEma: 0.7,
        },
        booking: { bookingId: "b", hourOfDay: 11 },
      },
      w,
    );
    expect(r.probability).toBeGreaterThanOrEqual(0.05);
    expect(r.probability).toBeLessThanOrEqual(0.95);
  });
});

describe("optimizeDecision pricing", () => {
  it("does not drift beyond rule multiplier cap", async () => {
    const opt = await optimizeDecision(
      "pricing",
      {
        basePrice: 1000,
        dynamicContext: {
          hourOfDay: 10,
          dayOfWeek: 3,
          demandLevel: "medium",
          cleanerAvailabilityRatio: 0.5,
        },
        conversionContext: {
          segment: "repeat",
          price: 1000,
          hourOfDay: 10,
          dayOfWeek: 3,
          channel: "web",
        },
      },
      { supabase: null },
    );
    const rule = calculateDynamicPrice(1000, {
      hourOfDay: 10,
      dayOfWeek: 3,
      demandLevel: "medium",
      cleanerAvailabilityRatio: 0.5,
    });
    const drift = Math.abs(opt.chosen.final_price - rule.final_price) / rule.final_price;
    expect(drift).toBeLessThanOrEqual(0.11);
  });
});

describe("assignExperimentVariant (no DB)", () => {
  it("is deterministic for subject + key", async () => {
    const a = await assignExperimentVariant(null, {
      subjectId: "user-1",
      experimentKey: "exp_a",
      rolloutPercent: 50,
    });
    const b = await assignExperimentVariant(null, {
      subjectId: "user-1",
      experimentKey: "exp_a",
      rolloutPercent: 50,
    });
    expect(a.variant).toBe(b.variant);
    expect(a.bucket).toBe(b.bucket);
  });
});
