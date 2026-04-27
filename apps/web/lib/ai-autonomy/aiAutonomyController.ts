import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONVERSION_EXPERIMENT_KEYS,
  learnConversionExperimentPerformance,
  type ConversionExperimentPerformanceRow,
} from "@/lib/conversion/conversionExperimentAnalytics";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** ~95% MoE for binomial p on n trials (simplified, interpretable). */
function conversionMarginOfError(p: number, n: number): number {
  if (n < 1 || !Number.isFinite(p)) return 1;
  const ph = clamp(p, 0.01, 0.99);
  return 1.96 * Math.sqrt((ph * (1 - ph)) / n);
}

export type AutonomyActionRecommendation = {
  experiment_key: string;
  recommended_variant: string;
  confidence: number;
  expected_revenue_uplift: number;
  /** Total exposures in window. */
  sample_size: number;
  /** For explainability. */
  control_composite: number;
  best_variant_composite: number;
};

/**
 * Recommends a variant per experiment from exposure + result aggregates.
 * Uplift is vs **control** revenue-per-send when control exists; else 0.
 */
export async function evaluateAndRecommendActions(
  admin: SupabaseClient,
  params?: { sinceIso?: string },
): Promise<AutonomyActionRecommendation[]> {
  const rows = await learnConversionExperimentPerformance(admin, { sinceIso: params?.sinceIso });
  const out: AutonomyActionRecommendation[] = [];

  for (const row of rows) {
    if (!(CONVERSION_EXPERIMENT_KEYS as readonly string[]).includes(row.experiment)) {
      continue;
    }
    const rec = bestArmForExperiment(row);
    if (rec) out.push(rec);
  }
  return out;
}

function bestArmForExperiment(row: ConversionExperimentPerformanceRow): AutonomyActionRecommendation | null {
  const sample_size = row.variants.reduce((s, v) => s + v.sends, 0);
  if (sample_size < 1) return null;

  const byName = new Map(row.variants.map((v) => [v.name, v] as const));
  const control = byName.get("control");
  /** Top-2 guard: ignore long-tail weak arms for winner + confidence. */
  const sorted = [...row.variants]
    .sort((a, b) => b.composite_score - a.composite_score || b.revenue_cents - a.revenue_cents)
    .slice(0, 2);
  const best = sorted[0]!;
  const second = sorted[1];
  if (!best) return null;

  const p = clamp(best.conversion, 0, 1);
  const n = Math.max(1, best.sends);
  const moe = conversionMarginOfError(p, n);
  /** Data-driven confidence: tight estimates + enough volume. */
  const volumeFactor = Math.min(1, Math.min(n, control?.sends ?? n) / 100);
  const leadOverControl =
    control != null
      ? (best.composite_score - control.composite_score) / Math.max(0.05, control.composite_score)
      : 0;
  const leadOverSecond = second
    ? (best.composite_score - second.composite_score) / Math.max(0.05, second.composite_score)
    : 0;
  const leadFactor = control != null ? clamp(leadOverControl, 0, 1) : clamp(0.5 + 0.2 * leadOverSecond, 0, 1);
  const confidence = clamp((1 - moe) * volumeFactor * (0.35 + 0.65 * leadFactor), 0, 0.99);

  const ctrlRps = control && control.sends > 0 ? control.revenue_cents / control.sends : 0;
  const bestRps = best.sends > 0 ? best.revenue_cents / best.sends : 0;
  const expected_revenue_uplift =
    control && ctrlRps > 0 ? (bestRps - ctrlRps) / ctrlRps : control ? bestRps - ctrlRps : 0;

  return {
    experiment_key: row.experiment,
    recommended_variant: best.name,
    confidence,
    expected_revenue_uplift: Math.round(10000 * expected_revenue_uplift) / 10000,
    sample_size,
    control_composite: control?.composite_score ?? 0,
    best_variant_composite: best.composite_score,
  };
}
