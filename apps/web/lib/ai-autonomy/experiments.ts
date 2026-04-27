import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ExperimentVariant = "control" | "variant";

function stableBucket0to99(subjectId: string, experimentKey: string): number {
  const s = `${experimentKey}::${subjectId}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return Math.abs(h) % 100;
}

function pickVariant(bucket: number, rolloutPercent: number): ExperimentVariant {
  const r = Math.min(100, Math.max(0, Math.round(rolloutPercent)));
  return bucket < r ? "variant" : "control";
}

/**
 * Deterministic A/B assignment per subject + experiment, with optional first-touch persistence.
 */
export async function assignExperimentVariant(
  supabase: SupabaseClient | null | undefined,
  params: {
    subjectId: string;
    experimentKey: string;
    rolloutPercent: number;
    metadata?: Record<string, unknown>;
  },
): Promise<{ variant: ExperimentVariant; bucket: number; persisted: boolean }> {
  const subjectId = String(params.subjectId ?? "").trim();
  const experimentKey = String(params.experimentKey ?? "").trim();
  const bucket = stableBucket0to99(subjectId, experimentKey);
  const variant = pickVariant(bucket, params.rolloutPercent);

  if (!supabase) {
    return { variant, bucket, persisted: false };
  }

  const { data: existing } = await supabase
    .from("ai_experiment_exposures")
    .select("variant, rollout_percent")
    .eq("subject_id", subjectId)
    .eq("experiment_key", experimentKey)
    .maybeSingle();

  if (existing && typeof existing === "object" && "variant" in existing) {
    const v = String((existing as { variant?: string }).variant ?? "").toLowerCase();
    return {
      variant: v === "variant" ? "variant" : "control",
      bucket,
      persisted: false,
    };
  }

  const { error } = await supabase.from("ai_experiment_exposures").insert({
    subject_id: subjectId,
    experiment_key: experimentKey,
    variant,
    rollout_percent: Math.min(100, Math.max(0, Math.round(params.rolloutPercent))),
    metadata: params.metadata ?? {},
  });

  if (error) {
    const { data: again } = await supabase
      .from("ai_experiment_exposures")
      .select("variant")
      .eq("subject_id", subjectId)
      .eq("experiment_key", experimentKey)
      .maybeSingle();
    const v2 = String((again as { variant?: string } | null)?.variant ?? variant).toLowerCase();
    return { variant: v2 === "variant" ? "variant" : "control", bucket, persisted: false };
  }

  return { variant, bucket, persisted: true };
}
