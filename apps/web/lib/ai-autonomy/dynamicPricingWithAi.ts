import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateDynamicPrice } from "@/lib/marketplace-intelligence/dynamicPricing";
import type { DynamicPriceResult, DynamicPricingContext } from "@/lib/marketplace-intelligence/types";
import { getAiAutonomyFlags } from "@/lib/ai-autonomy/flags";
import { optimizeDecision } from "@/lib/ai-autonomy/optimizeDecision";
import type { ConversionModelContext } from "@/lib/ai-autonomy/types";
import { logAiDecision } from "@/lib/ai-autonomy/decisionLog";
import { assignExperimentVariant } from "@/lib/ai-autonomy/experiments";

export type DynamicPriceWithAiResult = DynamicPriceResult & {
  ai?: {
    used: boolean;
    experiment?: { variant: string; bucket: number };
    objective_evaluated?: unknown;
  };
};

/**
 * Rule-based `calculateDynamicPrice` first, then optional small multi-objective search (conversion × revenue).
 */
export async function calculateDynamicPriceWithAiLayers(
  basePrice: number,
  dynamicContext: DynamicPricingContext,
  conversionContext: ConversionModelContext,
  options?: {
    supabase?: SupabaseClient | null;
    emitLog?: boolean;
    /** Stable id for experiments (e.g. session or booking draft id). */
    experimentSubjectId?: string;
  },
): Promise<DynamicPriceWithAiResult> {
  const flags = getAiAutonomyFlags();
  const rule = calculateDynamicPrice(basePrice, dynamicContext, { emitLog: options?.emitLog === true });

  if (!flags.pricing || !options?.supabase) {
    return { ...rule, ai: { used: false } };
  }

  const subject = String(options.experimentSubjectId ?? conversionContext.channel ?? "anonymous");
  const exp = await assignExperimentVariant(options.supabase, {
    subjectId: `${subject}:pricing`,
    experimentKey: "dynamic_price_ai_objective_v1",
    rolloutPercent: 15,
    metadata: { channel: conversionContext.channel },
  });

  if (exp.variant !== "variant") {
    return { ...rule, ai: { used: false, experiment: { variant: exp.variant, bucket: exp.bucket } } };
  }

  try {
    const opt = await optimizeDecision(
      "pricing",
      {
        basePrice,
        dynamicContext,
        conversionContext: { ...conversionContext, price: rule.final_price },
      },
      { supabase: options.supabase },
    );

    const chosen = opt.chosen;
    await logAiDecision(options.supabase, {
      decision_type: "pricing",
      context: { dynamicContext, conversionContext, experiment: exp },
      prediction: opt.predictions,
      chosen_action: chosen,
    });

    if (options.emitLog && Math.abs(chosen.final_price - rule.final_price) > 1e-6) {
      const { logSystemEvent } = await import("@/lib/logging/systemLog");
      void logSystemEvent({
        level: "info",
        source: "dynamic_price_applied",
        message: "AI autonomy layer adjusted price vs rule baseline",
        context: {
          rule_price: rule.final_price,
          final_price: chosen.final_price,
          multiplierOnRule: chosen.multiplierOnRule,
        },
      });
    }

    return {
      final_price: chosen.final_price,
      price_adjustment_reason: chosen.price_adjustment_reason,
      ai: {
        used: true,
        experiment: { variant: exp.variant, bucket: exp.bucket },
        objective_evaluated: opt.explain,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logAiDecision(options.supabase, {
      decision_type: "pricing",
      context: { dynamicContext, conversionContext, error: msg },
      prediction: null,
      chosen_action: { final_price: rule.final_price, source: "fallback_rule" },
    });
    return { ...rule, ai: { used: false } };
  }
}
