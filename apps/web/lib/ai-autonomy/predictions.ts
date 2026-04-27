import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { forecastDemand } from "@/lib/marketplace-intelligence/demandForecast";
import { predictAcceptanceProbability } from "@/lib/marketplace-intelligence/acceptanceProbability";
import type { ConversionModelContext, CleanerAcceptanceInput, DemandPrediction } from "@/lib/ai-autonomy/types";
import { getPricingWeights, mergeAssignmentWeights, type AssignmentWeights } from "@/lib/ai-autonomy/modelWeights";

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Avoid extreme probabilities for downstream optimization stability. */
export function clampProbability(p: number): number {
  if (!Number.isFinite(p)) return 0.5;
  return Math.min(0.95, Math.max(0.05, p));
}

/**
 * Interpretable linear-logit model over segment, price, time, channel.
 * Weights merge DB `ai_model_weights` (pricing scope) with sane defaults.
 */
export async function predictConversionProbability(
  context: ConversionModelContext,
  supabase?: SupabaseClient | null,
): Promise<{ probability: number; explain: Record<string, number | string> }> {
  const w = await getPricingWeights(supabase);
  const price = Number.isFinite(context.price) && context.price > 0 ? context.price : 1;
  const priceNorm = Math.log1p(price) / Math.log1p(5000);

  const seg =
    context.segment === "loyal"
      ? 0.35
      : context.segment === "repeat"
        ? 0.2
        : context.segment === "new"
          ? 0
          : context.segment === "churned"
            ? -0.5
            : -0.1;

  const peak = context.hourOfDay >= 7 && context.hourOfDay <= 9 || context.hourOfDay >= 16 && context.hourOfDay <= 19 ? -0.12 : 0.04;
  const weekend = context.dayOfWeek === 0 || context.dayOfWeek === 6 ? 0.06 : 0;

  const ch =
    context.channel === "web"
      ? 0.08
      : context.channel === "whatsapp"
        ? 0.04
        : context.channel === "email"
          ? -0.05
          : context.channel === "sms"
            ? -0.02
            : 0;

  const coldStart = context.segment === "unknown" && context.channel === "unknown";
  const priceDrag = (1 - priceNorm) * 0.45 * w.priceSensitivity;

  const z =
    -0.15 +
    w.segmentBias * seg +
    priceDrag +
    w.timeBias * (peak + weekend) +
    w.channelBias * ch +
    (coldStart ? -0.08 : 0);

  const raw = sigmoid(z);
  const probability = clampProbability(raw);

  return {
    probability,
    explain: {
      logit_z: Math.round(z * 1000) / 1000,
      segment_term: Math.round(seg * 1000) / 1000,
      price_norm: Math.round(priceNorm * 1000) / 1000,
      cold_start: coldStart ? 1 : 0,
    },
  };
}

export type CleanerAcceptanceResult = {
  probability: number;
  baseAcceptanceModel: number;
  outcomeEmaBlend: number;
  explain: Record<string, number | string>;
};

/** Hot-path sync variant: load weights once per dispatch batch via {@link mergeAssignmentWeights}. */
export function predictCleanerAcceptanceSync(input: CleanerAcceptanceInput, w: AssignmentWeights): CleanerAcceptanceResult {
  const c = input.cleaner;
  const base = predictAcceptanceProbability({
    distanceKm: c.distanceKm,
    acceptanceRecent: c.acceptanceRecent,
    acceptanceLifetime: c.acceptanceLifetime,
    recentDeclines: c.recentDeclines,
    fatigueOffersLastHour: c.fatigueOffersLastHour,
    hourOfDay: input.booking.hourOfDay,
  });

  const ema = c.outcomeEma != null && Number.isFinite(Number(c.outcomeEma)) ? clamp01(Number(c.outcomeEma)) : 0.5;
  const emaBlend = clamp01(0.5 + (ema - 0.5) * 0.8 * w.emaBlend);

  const probability = clampProbability(clamp01(base * w.acceptanceBlend * 0.55 + emaBlend * 0.45));

  return {
    probability,
    baseAcceptanceModel: base,
    outcomeEmaBlend: emaBlend,
    explain: {
      acceptanceBlend: w.acceptanceBlend,
      emaBlend: w.emaBlend,
      hourOfDay: input.booking.hourOfDay,
    },
  };
}

/**
 * Phase-3 acceptance heuristic + learned multipliers + optional outcome EMA blend.
 */
export async function predictCleanerAcceptance(
  input: CleanerAcceptanceInput,
  supabase?: SupabaseClient | null,
): Promise<CleanerAcceptanceResult> {
  const w = await mergeAssignmentWeights(supabase);
  return predictCleanerAcceptanceSync(input, w);
}

/**
 * Demand bucket + confidence from historical volume (wraps Phase-3 `forecastDemand`).
 */
export async function predictDemandLevel(
  supabase: SupabaseClient,
  dateYmd: string,
  locationKey: string,
): Promise<DemandPrediction> {
  const area = String(locationKey ?? "").trim();
  if (!area || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    return {
      demand_level: "medium",
      predicted_bookings: 0,
      confidence: 0,
      explain: "insufficient_location_or_date",
    };
  }

  const fc = await forecastDemand(supabase, dateYmd, area);
  const confidence = Math.min(1, (fc.predicted_bookings + 3) / 28);
  return {
    demand_level: fc.demand_level,
    predicted_bookings: fc.predicted_bookings,
    confidence: Math.round(confidence * 1000) / 1000,
    explain: `historical_count_window; predicted_bookings=${fc.predicted_bookings}`,
  };
}
