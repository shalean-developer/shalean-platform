import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type PricingWeights = {
  priceSensitivity: number;
  segmentBias: number;
  timeBias: number;
  channelBias: number;
};

export type AssignmentWeights = {
  acceptanceBlend: number;
  miScoreBlend: number;
  emaBlend: number;
};

export type GrowthWeights = {
  discountRoiPrior: number;
  upsellRoiPrior: number;
  nothingRoiPrior: number;
};

const DEFAULT_PRICING: PricingWeights = {
  priceSensitivity: 1,
  segmentBias: 1,
  timeBias: 1,
  channelBias: 1,
};

const DEFAULT_ASSIGNMENT: AssignmentWeights = {
  acceptanceBlend: 1,
  miScoreBlend: 1,
  emaBlend: 1,
};

const DEFAULT_GROWTH: GrowthWeights = {
  discountRoiPrior: 0.35,
  upsellRoiPrior: 0.42,
  nothingRoiPrior: 0.05,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function readPricing(raw: unknown): PricingWeights {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PRICING };
  const o = raw as Record<string, unknown>;
  return {
    priceSensitivity: clamp(Number(o.priceSensitivity ?? DEFAULT_PRICING.priceSensitivity), 0.5, 1.5),
    segmentBias: clamp(Number(o.segmentBias ?? DEFAULT_PRICING.segmentBias), 0.5, 1.5),
    timeBias: clamp(Number(o.timeBias ?? DEFAULT_PRICING.timeBias), 0.5, 1.5),
    channelBias: clamp(Number(o.channelBias ?? DEFAULT_PRICING.channelBias), 0.5, 1.5),
  };
}

function readAssignment(raw: unknown): AssignmentWeights {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_ASSIGNMENT };
  const o = raw as Record<string, unknown>;
  return {
    acceptanceBlend: clamp(Number(o.acceptanceBlend ?? DEFAULT_ASSIGNMENT.acceptanceBlend), 0.5, 1.5),
    miScoreBlend: clamp(Number(o.miScoreBlend ?? DEFAULT_ASSIGNMENT.miScoreBlend), 0.5, 1.5),
    emaBlend: clamp(Number(o.emaBlend ?? DEFAULT_ASSIGNMENT.emaBlend), 0.5, 1.5),
  };
}

function readGrowth(raw: unknown): GrowthWeights {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_GROWTH };
  const o = raw as Record<string, unknown>;
  return {
    discountRoiPrior: clamp(Number(o.discountRoiPrior ?? DEFAULT_GROWTH.discountRoiPrior), 0.05, 0.95),
    upsellRoiPrior: clamp(Number(o.upsellRoiPrior ?? DEFAULT_GROWTH.upsellRoiPrior), 0.05, 0.95),
    nothingRoiPrior: clamp(Number(o.nothingRoiPrior ?? DEFAULT_GROWTH.nothingRoiPrior), 0.01, 0.5),
  };
}

export async function getPricingWeights(supabase?: SupabaseClient | null): Promise<PricingWeights> {
  if (!supabase) return { ...DEFAULT_PRICING };
  const { data, error } = await supabase.from("ai_model_weights").select("weights").eq("decision_scope", "pricing").maybeSingle();
  if (error || !data) return { ...DEFAULT_PRICING };
  return readPricing((data as { weights?: unknown }).weights);
}

export async function mergeAssignmentWeights(supabase?: SupabaseClient | null): Promise<AssignmentWeights> {
  if (!supabase) return { ...DEFAULT_ASSIGNMENT };
  const { data, error } = await supabase.from("ai_model_weights").select("weights").eq("decision_scope", "assignment").maybeSingle();
  if (error || !data) return { ...DEFAULT_ASSIGNMENT };
  return readAssignment((data as { weights?: unknown }).weights);
}

export async function getGrowthWeights(supabase?: SupabaseClient | null): Promise<GrowthWeights> {
  if (!supabase) return { ...DEFAULT_GROWTH };
  const { data, error } = await supabase.from("ai_model_weights").select("weights").eq("decision_scope", "growth").maybeSingle();
  if (error || !data) return { ...DEFAULT_GROWTH };
  return readGrowth((data as { weights?: unknown }).weights);
}

export type WeightUpdateOutcome = {
  decision_scope: "pricing" | "assignment" | "growth";
  predicted: number;
  actual: number;
  /** Optional feature hints for asymmetric nudges */
  feature?: string;
};

const LEARN = 0.04;

/**
 * Tiny nudge toward observed outcome vs prediction; keeps weights bounded.
 */
export async function updateModelWeights(
  supabase: SupabaseClient,
  outcome: WeightUpdateOutcome,
): Promise<{ ok: boolean; weights?: unknown; error?: string }> {
  const { data: row, error: rErr } = await supabase
    .from("ai_model_weights")
    .select("weights")
    .eq("decision_scope", outcome.decision_scope)
    .maybeSingle();
  if (rErr) return { ok: false, error: rErr.message };

  const cur =
    outcome.decision_scope === "pricing"
      ? readPricing((row as { weights?: unknown } | null)?.weights)
      : outcome.decision_scope === "assignment"
        ? readAssignment((row as { weights?: unknown } | null)?.weights)
        : readGrowth((row as { weights?: unknown } | null)?.weights);

  const err = outcome.actual - outcome.predicted;
  let next: Record<string, number> = { ...cur };

  if (outcome.decision_scope === "pricing") {
    const c = cur as PricingWeights;
    next = {
      ...c,
      priceSensitivity: clamp(c.priceSensitivity + LEARN * err * (outcome.feature === "price" ? 0.08 : 0.02), 0.5, 1.5),
      segmentBias: clamp(c.segmentBias + LEARN * err * 0.04, 0.5, 1.5),
    };
  } else if (outcome.decision_scope === "assignment") {
    const c = cur as AssignmentWeights;
    next = {
      ...c,
      acceptanceBlend: clamp(c.acceptanceBlend + LEARN * err * 0.12, 0.5, 1.5),
      emaBlend: clamp(c.emaBlend + LEARN * err * 0.06, 0.5, 1.5),
    };
  } else {
    const c = cur as GrowthWeights;
    const key =
      outcome.feature === "discount"
        ? "discountRoiPrior"
        : outcome.feature === "upsell"
          ? "upsellRoiPrior"
          : "nothingRoiPrior";
    next = { ...c, [key]: clamp((c as Record<string, number>)[key] + LEARN * err * 0.1, 0.01, 0.95) };
  }

  const { error: uErr } = await supabase
    .from("ai_model_weights")
    .update({ weights: next, updated_at: new Date().toISOString() })
    .eq("decision_scope", outcome.decision_scope);
  if (uErr) return { ok: false, error: uErr.message };
  return { ok: true, weights: next };
}
