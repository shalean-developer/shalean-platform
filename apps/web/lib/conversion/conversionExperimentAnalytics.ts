import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateAndRecommendActions } from "@/lib/ai-autonomy/aiAutonomyController";
import { aiRolloutMinConfidence, isAiAutonomyEnabled, isAiAutoRolloutEnabled } from "@/lib/ai-autonomy/aiAutonomyEnv";
import { logAiDecision } from "@/lib/ai-autonomy/decisionLog";
import { aggregatePaymentLinkDeliveryStats } from "@/lib/pay/paymentLinkDeliveryStats";

export const CONVERSION_EXPERIMENT_KEYS = [
  "payment_email_timing",
  "payment_reminder_timing",
  "email_copy_test",
] as const;

export type ConversionVariantPerformance = {
  name: string;
  sends: number;
  conversions: number;
  conversion: number;
  revenue_cents: number;
  /** Expected revenue per exposure (revenue_cents / sends); supports rollout guard vs conversion-only. */
  revenue_per_send: number;
  /** conversion × revenue_per_send (scaled ×1e6 for readability in JSON). */
  composite_score: number;
};

export type ConversionExperimentPerformanceRow = {
  experiment: string;
  variants: ConversionVariantPerformance[];
};

type Agg = { sends: number; conversions: number; revenue: number };

function bumpAgg(m: Map<string, Agg>, variant: string, field: keyof Pick<Agg, "sends" | "conversions" | "revenue">, n: number) {
  const v = String(variant || "unknown");
  const cur = m.get(v) ?? { sends: 0, conversions: 0, revenue: 0 };
  if (field === "sends") cur.sends += n;
  if (field === "conversions") cur.conversions += n;
  if (field === "revenue") cur.revenue += n;
  m.set(v, cur);
}

/**
 * Joins `ai_experiment_exposures` (denominator) with `conversion_experiment_results` (paid conversions + revenue).
 */
export async function learnConversionExperimentPerformance(
  admin: SupabaseClient,
  params?: { sinceIso?: string; experimentKey?: string },
): Promise<ConversionExperimentPerformanceRow[]> {
  const since =
    params?.sinceIso ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const keys = params?.experimentKey?.trim()
    ? [params.experimentKey.trim()]
    : ([...CONVERSION_EXPERIMENT_KEYS] as string[]);

  let expQ = admin
    .from("ai_experiment_exposures")
    .select("experiment_key, variant, created_at")
    .gte("created_at", since)
    .in("experiment_key", keys);
  const { data: exposures, error: e1 } = await expQ;
  if (e1) return [];

  let resQ = admin
    .from("conversion_experiment_results")
    .select("experiment_key, variant, converted, revenue_cents, metadata")
    .gte("created_at", since)
    .in("experiment_key", keys);
  const { data: results, error: e2 } = await resQ;
  if (e2) return [];

  type ExpRow = { experiment_key: string; variant: string };
  type ResRow = {
    experiment_key: string;
    variant: string;
    converted: boolean;
    revenue_cents: number | null;
    metadata?: unknown;
  };

  function attributionInvalid(meta: unknown): boolean {
    if (meta == null || typeof meta !== "object" || Array.isArray(meta)) return false;
    const m = meta as Record<string, unknown>;
    return m.attribution_valid === false;
  }

  const byExp = new Map<string, Map<string, Agg>>();

  for (const raw of (exposures ?? []) as ExpRow[]) {
    const exp = String(raw.experiment_key ?? "");
    if (!exp) continue;
    if (!byExp.has(exp)) byExp.set(exp, new Map());
    bumpAgg(byExp.get(exp)!, raw.variant, "sends", 1);
  }

  for (const raw of (results ?? []) as ResRow[]) {
    const exp = String(raw.experiment_key ?? "");
    if (!exp) continue;
    if (raw.converted && attributionInvalid(raw.metadata)) continue;
    if (!byExp.has(exp)) byExp.set(exp, new Map());
    const vm = byExp.get(exp)!;
    if (raw.converted) {
      bumpAgg(vm, raw.variant, "conversions", 1);
      bumpAgg(vm, raw.variant, "revenue", Math.max(0, Math.round(Number(raw.revenue_cents ?? 0))));
    }
  }

  const out: ConversionExperimentPerformanceRow[] = [];
  for (const [experiment, vm] of byExp) {
    const variants: ConversionVariantPerformance[] = [];
    for (const [name, v] of vm) {
      const conversion = v.sends > 0 ? Math.round((1e4 * v.conversions) / v.sends) / 1e4 : 0;
      const revenue_per_send = v.sends > 0 ? Math.round(v.revenue / v.sends) : 0;
      const composite_score = Math.round(10000 * conversion * revenue_per_send) / 10000;
      variants.push({
        name,
        sends: v.sends,
        conversions: v.conversions,
        conversion,
        revenue_cents: v.revenue,
        revenue_per_send,
        composite_score,
      });
    }
    variants.sort((a, b) => b.conversion - a.conversion || b.revenue_cents - a.revenue_cents);
    out.push({ experiment, variants });
  }
  out.sort((a, b) => a.experiment.localeCompare(b.experiment));
  return out;
}

export type ConversionAutoRolloutSuggestion = {
  experiment_key: string;
  from_variant: string;
  to_variant: string;
  suggested_rollout_delta: number;
  reason: string;
};

/** Total exposures across control + variant_a must reach this before auto-rollout or aggressive suggestions. */
export const CONVERSION_ROLLOUT_MIN_TOTAL_EXPOSURES = 100;
/** Each arm should have material volume (MVP guard against noisy tails). */
export const CONVERSION_ROLLOUT_MIN_PER_ARM = 25;
export const CONVERSION_ROLLOUT_MIN_CONV_DIFF = 0.05;
/** Require variant expected revenue per send not materially below control when control earns. */
export const CONVERSION_ROLLOUT_MIN_REVENUE_RATIO = 0.98;

function revenuePerSend(v: ConversionVariantPerformance): number {
  return v.sends > 0 ? v.revenue_cents / v.sends : 0;
}

/**
 * Read-only suggestions when variant_a beats control on conversion **and** revenue-per-send (MVP guards).
 */
export function suggestConversionRolloutAdjustments(
  rows: ConversionExperimentPerformanceRow[],
): ConversionAutoRolloutSuggestion[] {
  const suggestions: ConversionAutoRolloutSuggestion[] = [];
  for (const row of rows) {
    const control = row.variants.find((v) => v.name === "control");
    const alt = row.variants.find((v) => v.name === "variant_a");
    if (!control || !alt) continue;

    const total = row.variants.reduce((s, v) => s + v.sends, 0);
    if (total < CONVERSION_ROLLOUT_MIN_TOTAL_EXPOSURES) continue;
    if (control.sends < CONVERSION_ROLLOUT_MIN_PER_ARM || alt.sends < CONVERSION_ROLLOUT_MIN_PER_ARM) continue;

    if (!(alt.conversion > control.conversion + CONVERSION_ROLLOUT_MIN_CONV_DIFF && alt.conversion > 0)) continue;

    const altRps = revenuePerSend(alt);
    const ctrlRps = revenuePerSend(control);
    /** Decision impact guard: do not scale variant with lower revenue per send than control. */
    if (ctrlRps > 0 && altRps < ctrlRps) continue;
    const altScore = alt.conversion * altRps;
    const ctrlScore = control.conversion * ctrlRps;
    const compositeOk =
      ctrlScore <= 0 ? altScore >= 0 : altScore >= ctrlScore * CONVERSION_ROLLOUT_MIN_REVENUE_RATIO;
    if (!compositeOk) continue;

    suggestions.push({
      experiment_key: row.experiment,
      from_variant: "control",
      to_variant: "variant_a",
      suggested_rollout_delta: 10,
      reason: `variant_a_conv_plus_${Math.round(CONVERSION_ROLLOUT_MIN_CONV_DIFF * 100)}pp_and_conv_x_revenue_ok_n_${total}`,
    });
  }
  return suggestions;
}

const MAX_AUTO_VARIANT_ROLLOUT = 90;
const AI_ROLLOUT_MIN_EXPOSURES = 100;
const ROLLOUT_STEP_PCT = 10;

/** AI-driven rollout/rollback: confidence + min sample, max +10% per tick, min 10% on variant for exploration. */
async function applyAiDrivenAutoRollout(admin: SupabaseClient, updates: string[]): Promise<Set<string>> {
  const touched = new Set<string>();
  if (!isAiAutonomyEnabled() || !isAiAutoRolloutEnabled()) return touched;

  const recs = await evaluateAndRecommendActions(admin, {});
  const minConf = aiRolloutMinConfidence();

  for (const rec of recs) {
    if (rec.sample_size <= AI_ROLLOUT_MIN_EXPOSURES) continue;
    if (rec.confidence < minConf) continue;

    const { data: arms } = await admin
      .from("conversion_experiments")
      .select("variant, rollout_percentage")
      .eq("key", rec.experiment_key)
      .eq("is_active", true);
    const list = (arms ?? []) as { variant: string; rollout_percentage: number }[];
    const ctrl = list.find((r) => String(r.variant).toLowerCase() === "control");
    const va = list.find((r) => String(r.variant).toLowerCase() === "variant_a");
    if (!ctrl || !va) continue;

    const aPct0 = Math.round(Number(va.rollout_percentage) || 0);
    const cPct0 = Math.round(Number(ctrl.rollout_percentage) || 0);
    if (cPct0 + aPct0 !== 100) continue;

    /** Decision impact guard: never roll forward on non-positive expected revenue vs control. */
    const mayRollForward = rec.expected_revenue_uplift > 0;
    const promoteVariantA = mayRollForward && rec.recommended_variant === "variant_a" && aPct0 < MAX_AUTO_VARIANT_ROLLOUT;
    const rollbackToControl =
      (rec.recommended_variant === "control" || rec.expected_revenue_uplift < 0) && aPct0 > 10;

    if (promoteVariantA) {
      const nextA = Math.min(MAX_AUTO_VARIANT_ROLLOUT, aPct0 + ROLLOUT_STEP_PCT);
      if (nextA <= aPct0) continue;
      const nextC = 100 - nextA;
      const { error: e1 } = await admin
        .from("conversion_experiments")
        .update({ rollout_percentage: nextA })
        .eq("key", rec.experiment_key)
        .eq("variant", "variant_a");
      const { error: e2 } = await admin
        .from("conversion_experiments")
        .update({ rollout_percentage: nextC })
        .eq("key", rec.experiment_key)
        .eq("variant", "control");
      if (!e1 && !e2) {
        touched.add(rec.experiment_key);
        updates.push(`[ai] ${rec.experiment_key}: variant_a ${aPct0}->${nextA}, control ${cPct0}->${nextC}`);
        void logAiDecision(admin, {
          decision_type: "variant",
          context: { experiment_key: rec.experiment_key, source: "ai_auto_rollout" },
          prediction: { recommended_variant: rec.recommended_variant, expected_revenue_uplift: rec.expected_revenue_uplift },
          chosen_action: { delta_pct: ROLLOUT_STEP_PCT, to: "variant_a" },
          confidence: rec.confidence,
        });
      }
    } else if (rollbackToControl) {
      const nextA = Math.max(10, aPct0 - ROLLOUT_STEP_PCT);
      if (nextA >= aPct0) continue;
      const nextC = 100 - nextA;
      const { error: e1 } = await admin
        .from("conversion_experiments")
        .update({ rollout_percentage: nextA })
        .eq("key", rec.experiment_key)
        .eq("variant", "variant_a");
      const { error: e2 } = await admin
        .from("conversion_experiments")
        .update({ rollout_percentage: nextC })
        .eq("key", rec.experiment_key)
        .eq("variant", "control");
      if (!e1 && !e2) {
        touched.add(rec.experiment_key);
        updates.push(`[ai-rollback] ${rec.experiment_key}: variant_a ${aPct0}->${nextA}, control ${cPct0}->${nextC}`);
        void logAiDecision(admin, {
          decision_type: "variant",
          context: { experiment_key: rec.experiment_key, source: "ai_auto_rollout_rollback" },
          prediction: { recommended_variant: "control" },
          chosen_action: { delta_pct: ROLLOUT_STEP_PCT, to: "control" },
          confidence: rec.confidence,
        });
      }
    }
  }
  return touched;
}

/**
 * When `CONVERSION_EXPERIMENT_AUTO_ROLLOUT=true`, nudges winning `variant_a` rollout up by at most 10 points
 * (paired down on `control`), capped so no arm reaches 100%.
 * When `AI_AUTONOMY_ENABLED` + `AI_AUTO_ROLLOUT_ENABLED`, applies confidence/sample-gated steps first; legacy rule path skips those keys for the same run.
 */
export async function maybeApplyConversionExperimentAutoRollout(
  admin: SupabaseClient,
): Promise<{ applied: boolean; updates: string[] }> {
  const updates: string[] = [];
  const aiTouched = await applyAiDrivenAutoRollout(admin, updates);
  const legacyEnabled = String(process.env.CONVERSION_EXPERIMENT_AUTO_ROLLOUT ?? "").toLowerCase() === "true";
  if (!legacyEnabled) {
    return { applied: updates.length > 0, updates };
  }

  const rows = await learnConversionExperimentPerformance(admin, {});
  const suggestions = suggestConversionRolloutAdjustments(rows);

  for (const s of suggestions) {
    if (aiTouched.has(s.experiment_key)) continue;
    const { data: arms } = await admin
      .from("conversion_experiments")
      .select("variant, rollout_percentage")
      .eq("key", s.experiment_key)
      .eq("is_active", true);

    const list = (arms ?? []) as { variant: string; rollout_percentage: number }[];
    const ctrl = list.find((r) => String(r.variant).toLowerCase() === "control");
    const va = list.find((r) => String(r.variant).toLowerCase() === "variant_a");
    if (!ctrl || !va) continue;

    const cPct = Math.round(Number(ctrl.rollout_percentage) || 0);
    const aPct = Math.round(Number(va.rollout_percentage) || 0);
    if (cPct + aPct !== 100) continue;

    const nextA = Math.min(MAX_AUTO_VARIANT_ROLLOUT, aPct + s.suggested_rollout_delta);
    if (nextA <= aPct) continue;

    const nextC = 100 - nextA;
    const { error: e1 } = await admin
      .from("conversion_experiments")
      .update({ rollout_percentage: nextA })
      .eq("key", s.experiment_key)
      .eq("variant", "variant_a");
    const { error: e2 } = await admin
      .from("conversion_experiments")
      .update({ rollout_percentage: nextC })
      .eq("key", s.experiment_key)
      .eq("variant", "control");
    if (!e1 && !e2) {
      updates.push(`${s.experiment_key}: variant_a ${aPct}->${nextA}, control ${cPct}->${nextC}`);
    }
  }

  return { applied: updates.length > 0, updates };
}

/** Lightweight channel stats for admin dashboard (existing payment delivery aggregates). */
export async function fetchPaymentDeliveryStatsForAdmin(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("bookings")
    .select("payment_link_delivery")
    .not("payment_link_delivery", "is", null)
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) return aggregatePaymentLinkDeliveryStats([]);
  return aggregatePaymentLinkDeliveryStats(data ?? []);
}
