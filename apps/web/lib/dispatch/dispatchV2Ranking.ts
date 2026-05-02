import type { SmartDispatchCandidate } from "@/lib/dispatch/types";

/** 0–1 boost from recency of last_active_at or last_response_at. */
export function recentActivityBoost(
  lastActiveAt: string | null | undefined,
  lastResponseAt: string | null | undefined,
): number {
  const raw = (lastActiveAt ?? lastResponseAt ?? "").trim();
  if (!raw) return 0.3;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return 0.3;
  const ageH = Math.max(0, (Date.now() - t) / 3_600_000);
  if (ageH <= 24) return 1;
  if (ageH <= 24 * 7) return 0.6;
  return 0.3;
}

export type RankedDispatchCleaner<T> = T & { dispatch_v2_score: number };

/**
 * Dispatch v2 composite ranking (rating, lifetime acceptance, volume, recency).
 * `jobs_completed` is capped to avoid overweighting vs 0–5 rating scale.
 */
export function rankCleanersForDispatchV2<T extends Record<string, unknown>>(
  cleaners: readonly T[],
): RankedDispatchCleaner<T>[] {
  const scored = cleaners.map((c) => {
    const rating = typeof c.rating === "number" && Number.isFinite(c.rating) ? Math.max(0, c.rating) : 0;
    const acceptance =
      typeof c.acceptance_rate === "number" && Number.isFinite(c.acceptance_rate)
        ? Math.max(0, Math.min(1, c.acceptance_rate))
        : 0;
    const jobs =
      typeof c.jobs_completed === "number" && Number.isFinite(c.jobs_completed) ? Math.max(0, c.jobs_completed) : 0;
    const lastActive = typeof c.last_active_at === "string" ? c.last_active_at : undefined;
    const lastResp = typeof c.last_response_at === "string" ? c.last_response_at : undefined;
    const jobsNorm = Math.min(1, jobs / 100);
    const dispatch_v2_score =
      rating * 0.4 + acceptance * 0.3 + jobsNorm * 0.2 + recentActivityBoost(lastActive, lastResp) * 0.1;
    return { ...c, dispatch_v2_score } as RankedDispatchCleaner<T>;
  });
  return scored.sort((a, b) => b.dispatch_v2_score - a.dispatch_v2_score);
}

/** Re-order smart-dispatch candidates by v2 score; stamps `priority_score` with v2 composite. */
export function reorderSmartDispatchCandidatesByV2(batch: readonly SmartDispatchCandidate[]): SmartDispatchCandidate[] {
  if (batch.length <= 1) return [...batch];
  const ranked = rankCleanersForDispatchV2(batch);
  return ranked.map((r) => {
    const { dispatch_v2_score, ...rest } = r as SmartDispatchCandidate & { dispatch_v2_score: number };
    return { ...(rest as SmartDispatchCandidate), priority_score: dispatch_v2_score };
  });
}
