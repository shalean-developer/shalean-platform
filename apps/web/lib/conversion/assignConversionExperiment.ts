import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ConversionExperimentArm = "control" | "variant_a" | "variant_b";

function stableBucket0to99(subjectId: string, experimentKey: string): number {
  const s = `${experimentKey}::${subjectId}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return Math.abs(h) % 100;
}

function normalizePersistedVariant(v: string): ConversionExperimentArm {
  const x = v.toLowerCase();
  if (x === "variant_a" || x === "variant_b") return x as ConversionExperimentArm;
  if (x === "variant") return "variant_a";
  return "control";
}

/**
 * Deterministic multi-arm assignment for conversion experiments.
 * Persists first exposure to `ai_experiment_exposures` (subject_id + experiment_key unique).
 */
export async function assignConversionExperimentVariant(
  admin: SupabaseClient | null | undefined,
  params: { subjectId: string; experimentKey: string },
): Promise<{ variant: ConversionExperimentArm; bucket: number; persisted: boolean }> {
  const subjectId = String(params.subjectId ?? "").trim();
  const experimentKey = String(params.experimentKey ?? "").trim();
  const bucket = stableBucket0to99(subjectId, experimentKey);

  if (!admin) {
    return { variant: bucket < 50 ? "control" : "variant_a", bucket, persisted: false };
  }

  const { data: existing } = await admin
    .from("ai_experiment_exposures")
    .select("variant")
    .eq("subject_id", subjectId)
    .eq("experiment_key", experimentKey)
    .maybeSingle();

  if (existing && typeof existing === "object" && "variant" in existing) {
    const v = String((existing as { variant?: string }).variant ?? "control");
    return { variant: normalizePersistedVariant(v), bucket, persisted: false };
  }

  const { data: arms } = await admin
    .from("conversion_experiments")
    .select("variant, rollout_percentage")
    .eq("key", experimentKey)
    .eq("is_active", true)
    .order("variant", { ascending: true });

  let chosen: ConversionExperimentArm = "control";
  const list = (arms ?? []) as { variant: string; rollout_percentage: number }[];
  if (list.length > 0) {
    let cursor = 0;
    let picked = false;
    for (const row of list) {
      const pct = Math.min(100, Math.max(0, Math.round(Number(row.rollout_percentage) || 0)));
      const end = Math.min(100, cursor + pct);
      if (bucket < end) {
        chosen = normalizePersistedVariant(String(row.variant ?? "control"));
        picked = true;
        break;
      }
      cursor = end;
    }
    if (!picked) chosen = "control";
  } else {
    chosen = bucket < 50 ? "control" : "variant_a";
  }

  const persistVariant =
    chosen === "variant_a" || chosen === "variant_b" ? chosen : chosen === "control" ? "control" : "control";
  const rollout_percent = 50;

  const { error } = await admin.from("ai_experiment_exposures").insert({
    subject_id: subjectId,
    experiment_key: experimentKey,
    variant: persistVariant,
    rollout_percent,
    metadata: {},
  });

  if (error) {
    const { data: again } = await admin
      .from("ai_experiment_exposures")
      .select("variant")
      .eq("subject_id", subjectId)
      .eq("experiment_key", experimentKey)
      .maybeSingle();
    const v2 = String((again as { variant?: string } | null)?.variant ?? persistVariant);
    return { variant: normalizePersistedVariant(v2), bucket, persisted: false };
  }

  return { variant: chosen, bucket, persisted: true };
}

/**
 * Inline delay for `payment_email_timing` variant_a (only when `PAYMENT_LINK_EXPERIMENT_DELAY_INLINE=true`).
 * Default path uses `conversion_deferred_payment_link_emails` + cron (`/api/cron/deferred-payment-link-emails`).
 */
export async function maybeDelayPaymentLinkEmailExperiment(variant: ConversionExperimentArm): Promise<void> {
  if (variant !== "variant_a") return;
  const raw = Number(process.env.PAYMENT_LINK_EXPERIMENT_DELAY_SECONDS ?? "0");
  if (!Number.isFinite(raw) || raw <= 0) return;
  const sec = Math.min(Math.floor(raw), 900);
  await new Promise((r) => setTimeout(r, sec * 1000));
}
