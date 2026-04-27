import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decideGrowthAction,
  type DecideGrowthActionInput,
  type DecideGrowthActionResult,
} from "@/lib/growth/decideGrowthAction";
import { getAiAutonomyFlags } from "@/lib/ai-autonomy/flags";
import { getGrowthWeights } from "@/lib/ai-autonomy/modelWeights";
import { predictConversionProbability } from "@/lib/ai-autonomy/predictions";
import { optimizeDecision } from "@/lib/ai-autonomy/optimizeDecision";
import type { GrowthRoiCandidate } from "@/lib/ai-autonomy/types";
import { logAiDecision } from "@/lib/ai-autonomy/decisionLog";
import { assignExperimentVariant } from "@/lib/ai-autonomy/experiments";

/**
 * Rule-based growth decision first; optional ROI ranking using lightweight conversion priors + stored weights.
 */
export async function decideGrowthActionWithAi(
  admin: SupabaseClient | null | undefined,
  input: DecideGrowthActionInput,
  options?: { userId?: string | null },
): Promise<DecideGrowthActionResult> {
  const rule = decideGrowthAction(input);
  const flags = getAiAutonomyFlags();
  if (!flags.growth || !admin) {
    return rule;
  }

  const subject = String(options?.userId ?? "anonymous").trim() || "anonymous";
  const exp = await assignExperimentVariant(admin, {
    subjectId: `${subject}:growth`,
    experimentKey: "growth_action_roi_v1",
    rolloutPercent: 12,
    metadata: { segment: input.segment },
  });
  if (exp.variant !== "variant") {
    return rule;
  }

  try {
    const w = await getGrowthWeights(admin);
    const hour = new Date().getUTCHours();
    const dow = new Date().getUTCDay();
    const baseConv = await predictConversionProbability(
      {
        segment: input.segment,
        price: 1200,
        hourOfDay: hour,
        dayOfWeek: dow,
        channel: "email",
      },
      admin,
    );

    const candidates: GrowthRoiCandidate[] = [
      {
        action: "offer_discount",
        channel: "email",
        predictedRoi: w.discountRoiPrior * baseConv.probability * (input.retention === "churned" ? 1.25 : 1),
        reason: "roi_model_discount",
      },
      {
        action: "offer_discount",
        channel: "whatsapp",
        predictedRoi: w.discountRoiPrior * baseConv.probability * 0.92,
        reason: "roi_model_discount_wa",
      },
      {
        action: "upsell",
        channel: "email",
        predictedRoi: w.upsellRoiPrior * baseConv.probability * (input.ltv.ltv_score === "high" ? 1.2 : 1),
        reason: "roi_model_upsell",
      },
      {
        action: "upsell",
        channel: "whatsapp",
        predictedRoi: w.upsellRoiPrior * baseConv.probability * (input.retention === "at_risk" ? 1.08 : 0.95),
        reason: "roi_model_upsell_wa",
      },
      {
        action: "do_nothing",
        channel: "email",
        predictedRoi: w.nothingRoiPrior,
        reason: "roi_model_hold",
      },
    ];

    if (input.discountBudgetOk === false) {
      for (const c of candidates) {
        if (c.action === "offer_discount") c.predictedRoi *= 0.35;
      }
    }

    const opt = await optimizeDecision(
      "growth",
      { candidates, ruleFallback: rule },
      { supabase: admin },
    );

    await logAiDecision(admin, {
      decision_type: "growth",
      context: { segment: input.segment, retention: input.retention, ltv: input.ltv.ltv_score, experiment: exp },
      prediction: opt.predictions,
      chosen_action: opt.chosen,
    });

    return {
      action: opt.chosen.action,
      channel: opt.chosen.channel,
      reason: `${opt.chosen.reason}|ai_growth`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logAiDecision(admin, {
      decision_type: "growth",
      context: { input, error: msg },
      prediction: null,
      chosen_action: { ...rule, source: "fallback_rule" },
    });
    return rule;
  }
}
