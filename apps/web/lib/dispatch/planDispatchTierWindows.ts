import type { TieredCleaner } from "@/lib/dispatch/buildDispatchTiers";

export type DispatchTierWindowPlan = {
  candidateId: string;
  tier: "A" | "B" | "C";
  rankIndex: number;
  dispatchVisibleAtIso: string;
  dispatchTierWindowEndAtIso: string;
};

function envMs(name: string, fallbackMs: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallbackMs;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 5_000 ? Math.floor(n) : fallbackMs;
}

/** Default Tier A exclusivity 90s, Tier B 90s (then C visible). */
function tierWindowMsA(urgentJob: boolean): number {
  const base = envMs("DISPATCH_TIER_A_WINDOW_MS", 90_000);
  return urgentJob ? Math.min(base, envMs("DISPATCH_TIER_A_WINDOW_URGENT_MS", 30_000)) : base;
}

function tierWindowMsB(urgentJob: boolean): number {
  const base = envMs("DISPATCH_TIER_B_WINDOW_MS", 90_000);
  return urgentJob ? Math.min(base, envMs("DISPATCH_TIER_B_WINDOW_URGENT_MS", 30_000)) : base;
}

/**
 * Flatten tiers into per-cleaner visibility schedule (absolute ISO times).
 * When `broadcastImmediate`, all rows visible at T0 (small pool / skip-stagger rules).
 */
export function planDispatchTierWindows(
  tierA: TieredCleaner[],
  tierB: TieredCleaner[],
  tierC: TieredCleaner[],
  options: { urgentJob: boolean; broadcastImmediate: boolean },
): DispatchTierWindowPlan[] {
  const t0 = Date.now();
  const t0Iso = new Date(t0).toISOString();
  if (options.broadcastImmediate) {
    const flat = [...tierA, ...tierB, ...tierC];
    return flat.map((row, rankIndex) => ({
      candidateId: row.candidate.id,
      tier: row.tier,
      rankIndex,
      dispatchVisibleAtIso: t0Iso,
      dispatchTierWindowEndAtIso: new Date(t0 + tierWindowMsA(options.urgentJob)).toISOString(),
    }));
  }
  const wa = tierWindowMsA(options.urgentJob);
  const wb = tierWindowMsB(options.urgentJob);
  const tAEnd = t0 + wa;
  const tBEnd = tAEnd + wb;
  const out: DispatchTierWindowPlan[] = [];
  let rank = 0;
  for (const row of tierA) {
    out.push({
      candidateId: row.candidate.id,
      tier: "A",
      rankIndex: rank++,
      dispatchVisibleAtIso: t0Iso,
      dispatchTierWindowEndAtIso: new Date(tAEnd).toISOString(),
    });
  }
  for (const row of tierB) {
    out.push({
      candidateId: row.candidate.id,
      tier: "B",
      rankIndex: rank++,
      dispatchVisibleAtIso: new Date(tAEnd).toISOString(),
      dispatchTierWindowEndAtIso: new Date(tBEnd).toISOString(),
    });
  }
  for (const row of tierC) {
    out.push({
      candidateId: row.candidate.id,
      tier: "C",
      rankIndex: rank++,
      dispatchVisibleAtIso: new Date(tBEnd).toISOString(),
      dispatchTierWindowEndAtIso: new Date(tBEnd).toISOString(),
    });
  }
  return out;
}
