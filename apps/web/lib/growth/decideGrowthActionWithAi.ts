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

function hasEmailFlag(input: DecideGrowthActionInput): boolean {
  return input.hasEmail !== false;
}

function hasPhoneFlag(input: DecideGrowthActionInput): boolean {
  return input.hasPhone === true;
}

function buildGrowthRoiCandidates(
  input: DecideGrowthActionInput,
  w: Awaited<ReturnType<typeof getGrowthWeights>>,
  baseConvEmail: { probability: number },
  baseConvSms: { probability: number },
): GrowthRoiCandidate[] {
  const hasEmail = hasEmailFlag(input);
  const hasPhone = hasPhoneFlag(input);

  if (!hasEmail && !hasPhone) {
    return [{ action: "do_nothing", channel: "email", predictedRoi: w.nothingRoiPrior, reason: "roi_no_contact" }];
  }

  if (!hasEmail && hasPhone) {
    return [
      {
        action: "offer_discount",
        channel: "sms",
        predictedRoi: w.discountRoiPrior * baseConvSms.probability * (input.retention === "churned" ? 1.15 : 1),
        reason: "roi_model_discount_sms",
      },
      {
        action: "upsell",
        channel: "sms",
        predictedRoi: w.upsellRoiPrior * baseConvSms.probability * (input.ltv.ltv_score === "high" ? 1.12 : 1),
        reason: "roi_model_upsell_sms",
      },
      {
        action: "do_nothing",
        channel: "sms",
        predictedRoi: w.nothingRoiPrior,
        reason: "roi_model_hold_sms",
      },
    ];
  }

  return [
    {
      action: "offer_discount",
      channel: "email",
      predictedRoi: w.discountRoiPrior * baseConvEmail.probability * (input.retention === "churned" ? 1.25 : 1),
      reason: "roi_model_discount_email",
    },
    {
      action: "upsell",
      channel: "email",
      predictedRoi: w.upsellRoiPrior * baseConvEmail.probability * (input.ltv.ltv_score === "high" ? 1.2 : 1),
      reason: "roi_model_upsell_email",
    },
    {
      action: "do_nothing",
      channel: "email",
      predictedRoi: w.nothingRoiPrior,
      reason: "roi_model_hold_email",
    },
  ];
}

/**
 * Rule-based growth decision first; optional ROI ranking using lightweight conversion priors + stored weights.
 * AI may only choose among **email** candidates when email exists; **SMS** candidates exist only when there is no email (phone-only).
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
    const baseConvEmail = await predictConversionProbability(
      {
        segment: input.segment,
        price: 1200,
        hourOfDay: hour,
        dayOfWeek: dow,
        channel: "email",
      },
      admin,
    );
    const baseConvSms = await predictConversionProbability(
      {
        segment: input.segment,
        price: 1200,
        hourOfDay: hour,
        dayOfWeek: dow,
        channel: "sms",
      },
      admin,
    );

    let candidates = buildGrowthRoiCandidates(input, w, baseConvEmail, baseConvSms);

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
      context: {
        segment: input.segment,
        retention: input.retention,
        ltv: input.ltv.ltv_score,
        experiment: exp,
        channel: opt.chosen.channel,
        growth_policy: "email_first_sms_fallback",
      },
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
