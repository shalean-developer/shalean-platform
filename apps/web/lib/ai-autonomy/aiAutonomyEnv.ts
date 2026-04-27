import "server-only";

/**
 * Phase 8: explicit autonomy gates. **All default false** — no behavior change until env is set.
 * Use alongside `AI_DISABLED`, `getAiAutonomyFlags`, and per-domain toggles.
 */
function envTrue(v: string | undefined): boolean {
  return String(v ?? "").toLowerCase() === "true" || v === "1";
}

/** Master: AI autonomy recommendations, timing optimization hooks, and learning loop. */
export function isAiAutonomyEnabled(): boolean {
  return envTrue(process.env.AI_AUTONOMY_ENABLED);
}

/** Gated: AI-driven auto-rollout in `maybeApplyConversionExperimentAutoRollout` (additive to legacy). */
export function isAiAutoRolloutEnabled(): boolean {
  return envTrue(process.env.AI_AUTO_ROLLOUT_ENABLED);
}

/** Gated: `optimizeSendTiming` / `optimizeFallbackTiming` non-zero delays. */
export function isAiTimingOptimizationEnabled(): boolean {
  return envTrue(process.env.AI_TIMING_OPTIMIZATION_ENABLED);
}

export function aiRolloutMinConfidence(): number {
  const n = Number(process.env.AI_ROLLOUT_MIN_CONFIDENCE ?? "0.65");
  if (!Number.isFinite(n) || n <= 0) return 0.65;
  return Math.min(0.99, Math.max(0.1, n));
}

export function aiSendTimingMaxDelaySec(): number {
  const n = Number(process.env.AI_SEND_TIMING_MAX_DELAY_SEC ?? "60");
  if (!Number.isFinite(n) || n < 0) return 60;
  return Math.min(900, Math.floor(n));
}

/** No weight update if model/branch confidence is below this (default 0.6). */
export function aiLearnMinConfidence(): number {
  const n = Number(process.env.AI_LEARN_MIN_CONFIDENCE ?? "0.6");
  if (!Number.isFinite(n) || n < 0) return 0.6;
  return Math.min(0.99, Math.max(0.2, n));
}

/** Suppress re-running send delay optimization within this window (default 24h). */
export function aiSendTimingCooldownMs(): number {
  const n = Number(process.env.AI_SEND_TIMING_COOLDOWN_HOURS ?? "24");
  if (!Number.isFinite(n) || n <= 0) return 24 * 60 * 60 * 1000;
  return Math.min(168, n) * 60 * 60 * 1000;
}
