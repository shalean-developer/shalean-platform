import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateDynamicPrice } from "@/lib/marketplace-intelligence/dynamicPricing";
import type { DynamicPricingContext } from "@/lib/marketplace-intelligence/types";
import { predictConversionProbability, clampProbability } from "@/lib/ai-autonomy/predictions";
import type {
  CleanerAcceptanceBookingSlice,
  CleanerAcceptanceInput,
  ConversionModelContext,
  GrowthRoiCandidate,
} from "@/lib/ai-autonomy/types";
import type { AssignmentWeights } from "@/lib/ai-autonomy/modelWeights";
import { predictCleanerAcceptanceSync } from "@/lib/ai-autonomy/predictions";
import type { GrowthAction, GrowthChannel } from "@/lib/growth/decideGrowthAction";

export type PricingOptimizeContext = {
  basePrice: number;
  dynamicContext: DynamicPricingContext;
  conversionContext: ConversionModelContext;
};

export type AssignmentOptimizeContext = {
  candidates: Array<{
    cleanerId: string;
    dispatchScore: number;
    cleaner: CleanerAcceptanceInput["cleaner"];
    booking: CleanerAcceptanceBookingSlice;
  }>;
  weights: AssignmentWeights;
};

export type GrowthOptimizeContext = {
  candidates: GrowthRoiCandidate[];
  ruleFallback: { action: GrowthAction; channel: GrowthChannel; reason: string };
};

export type OptimizeDecisionResult =
  | {
      decision_type: "pricing";
      usedAi: boolean;
      fallbackReason?: string;
      chosen: { final_price: number; price_adjustment_reason: string; multiplierOnRule: number };
      predictions: Record<string, unknown>;
      explain: Record<string, unknown>;
    }
  | {
      decision_type: "assignment";
      usedAi: boolean;
      fallbackReason?: string;
      chosen: { cleanerId: string; combinedScore: number };
      ranking: Array<{ cleanerId: string; combinedScore: number }>;
      predictions: Record<string, unknown>;
      explain: Record<string, unknown>;
    }
  | {
      decision_type: "growth";
      usedAi: boolean;
      fallbackReason?: string;
      chosen: { action: GrowthAction; channel: GrowthChannel; reason: string; predictedRoi: number };
      predictions: Record<string, unknown>;
      explain: Record<string, unknown>;
    };

export async function optimizeDecision(
  decision_type: "pricing",
  context: PricingOptimizeContext,
  options?: { supabase?: SupabaseClient | null },
): Promise<Extract<OptimizeDecisionResult, { decision_type: "pricing" }>>;
export async function optimizeDecision(
  decision_type: "assignment",
  context: AssignmentOptimizeContext,
  options?: { supabase?: SupabaseClient | null },
): Promise<Extract<OptimizeDecisionResult, { decision_type: "assignment" }>>;
export async function optimizeDecision(
  decision_type: "growth",
  context: GrowthOptimizeContext,
  options?: { supabase?: SupabaseClient | null },
): Promise<Extract<OptimizeDecisionResult, { decision_type: "growth" }>>;
export async function optimizeDecision(
  decision_type: "pricing" | "assignment" | "growth",
  context: unknown,
  options?: { supabase?: SupabaseClient | null },
): Promise<OptimizeDecisionResult> {
  const supabase = options?.supabase;

  if (decision_type === "pricing") {
    const ctx = context as PricingOptimizeContext;
    const rule = calculateDynamicPrice(ctx.basePrice, ctx.dynamicContext);
    const rulePrice = rule.final_price;
    if (!Number.isFinite(rulePrice) || rulePrice <= 0) {
      return {
        decision_type: "pricing",
        usedAi: false,
        fallbackReason: "invalid_rule_price",
        chosen: { final_price: ctx.basePrice, price_adjustment_reason: "none", multiplierOnRule: 1 },
        predictions: {},
        explain: {},
      };
    }

    const multipliers = [0.95, 0.98, 1, 1.03, 1.05, 1.08];
    const basePred = await predictConversionProbability(
      { ...ctx.conversionContext, price: rulePrice },
      supabase,
    );
    let bestPrice = rulePrice;
    let bestObj = clampProbability(basePred.probability) * rulePrice;
    const evaluated: Array<{ price: number; p: number; objective: number }> = [
      { price: rulePrice, p: clampProbability(basePred.probability), objective: bestObj },
    ];

    for (const m of multipliers) {
      const cand = Math.round(rulePrice * m * 100) / 100;
      const drift = Math.abs(cand - rulePrice) / rulePrice;
      if (drift > 0.1 + 1e-9) continue;
      if (Math.abs(cand - rulePrice) < 0.01) continue;
      const { probability } = await predictConversionProbability(
        { ...ctx.conversionContext, price: cand },
        supabase,
      );
      const p = clampProbability(probability);
      const objective = p * cand;
      evaluated.push({ price: cand, p, objective });
      if (objective > bestObj + 1e-6) {
        bestObj = objective;
        bestPrice = cand;
      }
    }

    const chosenPrice = bestPrice;
    const mult = chosenPrice / rulePrice;

    const reasons =
      Math.abs(chosenPrice - rulePrice) < 0.01
        ? rule.price_adjustment_reason
        : `${rule.price_adjustment_reason}+ai_price_${Math.round(mult * 1000) / 1000}`;

    return {
      decision_type: "pricing",
      usedAi: true,
      chosen: {
        final_price: chosenPrice,
        price_adjustment_reason: reasons,
        multiplierOnRule: Math.round(mult * 1000) / 1000,
      },
      predictions: { evaluated, rule_price: rulePrice },
      explain: { evaluated },
    };
  }

  if (decision_type === "assignment") {
    const ctx = context as AssignmentOptimizeContext;
    if (!ctx.candidates.length) {
      return {
        decision_type: "assignment",
        usedAi: false,
        fallbackReason: "no_candidates",
        chosen: { cleanerId: "", combinedScore: 0 },
        ranking: [],
        predictions: {},
        explain: {},
      };
    }

    const ranking = ctx.candidates.map((c) => {
      const acc = predictCleanerAcceptanceSync({ cleaner: c.cleaner, booking: c.booking }, ctx.weights);
      const combined =
        c.dispatchScore +
        (acc.probability - 0.5) * 3.2 * ctx.weights.acceptanceBlend +
        (ctx.weights.miScoreBlend * (acc.baseAcceptanceModel + acc.outcomeEmaBlend)) / 12;
      return { cleanerId: c.cleanerId, combinedScore: combined, pAccept: acc.probability };
    });
    ranking.sort((a, b) => b.combinedScore - a.combinedScore);
    const top = ranking[0]!;
    return {
      decision_type: "assignment",
      usedAi: true,
      chosen: { cleanerId: top.cleanerId, combinedScore: top.combinedScore },
      ranking: ranking.map((r) => ({ cleanerId: r.cleanerId, combinedScore: r.combinedScore })),
      predictions: Object.fromEntries(
        ranking.map((r) => [r.cleanerId, { combinedScore: r.combinedScore, p_accept: r.pAccept }]),
      ),
      explain: { method: "dispatch_score_plus_acceptance_blend" },
    };
  }

  const ctx = context as GrowthOptimizeContext;
  if (!ctx.candidates.length) {
    return {
      decision_type: "growth",
      usedAi: false,
      fallbackReason: "no_candidates",
      chosen: { ...ctx.ruleFallback, predictedRoi: 0 },
      predictions: {},
      explain: {},
    };
  }

  let best = ctx.candidates[0]!;
  for (const c of ctx.candidates) {
    if (c.predictedRoi > best.predictedRoi) best = c;
  }
  const tiedRule =
    ctx.candidates.filter((c) => Math.abs(c.predictedRoi - best.predictedRoi) < 1e-6).length > 1;
  if (tiedRule) {
    best = {
      action: ctx.ruleFallback.action,
      channel: ctx.ruleFallback.channel,
      predictedRoi:
        ctx.candidates.find((c) => c.action === ctx.ruleFallback.action && c.channel === ctx.ruleFallback.channel)
          ?.predictedRoi ?? best.predictedRoi,
      reason: ctx.ruleFallback.reason,
    };
  }

  return {
    decision_type: "growth",
    usedAi: true,
    chosen: {
      action: best.action as GrowthAction,
      channel: best.channel as GrowthChannel,
      reason: best.reason,
      predictedRoi: best.predictedRoi,
    },
    predictions: { candidates: ctx.candidates },
    explain: { tie_break_rule: tiedRule },
  };
}
