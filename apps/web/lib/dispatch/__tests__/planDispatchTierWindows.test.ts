import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TieredCleaner } from "@/lib/dispatch/buildDispatchTiers";
import { planDispatchTierWindows } from "@/lib/dispatch/planDispatchTierWindows";
import type { SmartDispatchCandidate } from "@/lib/dispatch/types";

function tc(id: string, tier: "A" | "B" | "C", jobFitScore: number): TieredCleaner {
  const candidate: SmartDispatchCandidate = {
    id,
    full_name: id,
    rating: 5,
    jobs_completed: 1,
    status: "online",
    score: 10,
    distance_km: 3,
  };
  return { candidate, tier, jobFitScore };
}

describe("planDispatchTierWindows", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T10:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("broadcastImmediate sets same visibility for all tiers", () => {
    const tierA = [tc("a", "A", 1)];
    const tierB = [tc("b", "B", 0.9)];
    const plans = planDispatchTierWindows(tierA, tierB, [], {
      urgentJob: false,
      broadcastImmediate: true,
    });
    expect(plans).toHaveLength(2);
    expect(plans[0]!.dispatchVisibleAtIso).toBe(plans[1]!.dispatchVisibleAtIso);
  });

  it("staggers B after A and C after B when not broadcast", () => {
    vi.stubEnv("DISPATCH_TIER_A_WINDOW_MS", "60000");
    vi.stubEnv("DISPATCH_TIER_B_WINDOW_MS", "120000");
    const tierA = [tc("a", "A", 1)];
    const tierB = [tc("b", "B", 0.8)];
    const tierC = [tc("c", "C", 0.5)];
    const plans = planDispatchTierWindows(tierA, tierB, tierC, {
      urgentJob: false,
      broadcastImmediate: false,
    });
    const visA = new Date(plans.find((p) => p.tier === "A")!.dispatchVisibleAtIso).getTime();
    const visB = new Date(plans.find((p) => p.tier === "B")!.dispatchVisibleAtIso).getTime();
    const visC = new Date(plans.find((p) => p.tier === "C")!.dispatchVisibleAtIso).getTime();
    expect(visB - visA).toBe(60_000);
    expect(visC - visB).toBe(120_000);
  });
});
