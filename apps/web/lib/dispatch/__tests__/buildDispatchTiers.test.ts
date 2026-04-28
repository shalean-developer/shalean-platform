import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDispatchTiers } from "@/lib/dispatch/buildDispatchTiers";
import type { SmartDispatchCandidate } from "@/lib/dispatch/types";

function cand(id: string, score: number, distance_km = 5): SmartDispatchCandidate {
  return {
    id,
    full_name: id,
    rating: 4.5,
    jobs_completed: 10,
    status: "online",
    score,
    distance_km,
  };
}

describe("buildDispatchTiers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("splits into A, B, C with default sizes", () => {
    const sorted = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"].map((id, i) =>
      cand(id, 100 - i),
    );
    const fits = new Map(sorted.map((c, i) => [c.id, 1 - i * 0.01]));
    const { tierA, tierB, tierC } = buildDispatchTiers(sorted, fits);
    expect(tierA).toHaveLength(4);
    expect(tierB).toHaveLength(7);
    expect(tierC).toHaveLength(1);
    expect(tierA[0]?.tier).toBe("A");
    expect(tierB[0]?.tier).toBe("B");
    expect(tierC[0]?.tier).toBe("C");
  });

  it("respects DISPATCH_TIER_A_SIZE", () => {
    vi.stubEnv("DISPATCH_TIER_A_SIZE", "2");
    vi.stubEnv("DISPATCH_TIER_B_SIZE", "3");
    const sorted = ["a", "b", "c", "d", "e", "f"].map((id, i) => cand(id, 50 - i));
    const fits = new Map(sorted.map((c) => [c.id, 0.5]));
    const { tierA, tierB, tierC } = buildDispatchTiers(sorted, fits);
    expect(tierA).toHaveLength(2);
    expect(tierB).toHaveLength(3);
    expect(tierC).toHaveLength(1);
  });
});
