/**
 * Deterministic 0–1 dispatch fit score (per cleaner, per job context).
 * Used for tier ordering only — does not replace marketplace payout or earnings logic.
 */

export type ScoreCleanerForJobInput = {
  /** Great-circle km to job; non-finite → treated as unknown. */
  distanceKm: number | null;
  /** Cleaner already passed hard availability / overlap filters → 1, else 0. */
  availabilityOk: boolean;
  /** 0–1 completion / acceptance blend (e.g. (lifetime+recent)/2). */
  reliability01: number | null;
  /** Recent dispatch offers accepted or assigned (higher → stronger fairness penalty). */
  fatigueOffersLastHour: number;
  /** Optional typical job pay ZAR for cleaner; unknown → earnings fit neutral. */
  jobPayZar?: number | null;
  typicalPayZar?: number | null;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

/** 1 = very close, 0 = very far; unknown distance → 0.5 */
export function proximityScore01(distanceKm: number | null, maxKmInBatch: number): number {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm < 0) return 0.5;
  const denom = Math.max(maxKmInBatch, 1);
  return clamp01(1 - distanceKm / denom);
}

export function availabilityScore01(availabilityOk: boolean): number {
  return availabilityOk ? 1 : 0;
}

/** Normalize reliability; no data → 0.7 */
export function reliabilityScore01(reliability01: number | null): number {
  if (reliability01 == null || !Number.isFinite(reliability01)) return 0.7;
  return clamp01(reliability01);
}

/**
 * Fairness: penalize cleaners who just saw traffic.
 * last_assigned proxy: fatigueOffersLastHour from existing dispatch counters.
 */
export function recencyPenaltyScore01(fatigueOffersLastHour: number): number {
  const f = Math.max(0, Math.floor(fatigueOffersLastHour));
  if (f >= 3) return 0.2;
  if (f >= 1) return 0.6;
  return 1;
}

/** Prefer jobs near cleaner typical band; unknown → 0.5 */
export function earningsFitScore01(jobPayZar: number | null | undefined, typicalPayZar: number | null | undefined): number {
  const j = jobPayZar != null && Number.isFinite(jobPayZar) && jobPayZar > 0 ? jobPayZar : null;
  const t = typicalPayZar != null && Number.isFinite(typicalPayZar) && typicalPayZar > 0 ? typicalPayZar : null;
  if (j == null || t == null) return 0.5;
  const ratio = j / t;
  const err = Math.abs(Math.log(Math.max(ratio, 0.01)));
  return clamp01(1 - err / 2);
}

/**
 * Composite 0–1 score per product spec:
 * 0.35 proximity + 0.25 availability + 0.15 reliability + 0.15 recency + 0.10 earnings fit
 */
export function scoreCleanerForJob(input: ScoreCleanerForJobInput, maxDistanceKm: number): number {
  const p = proximityScore01(input.distanceKm, maxDistanceKm);
  const a = availabilityScore01(input.availabilityOk);
  const r = reliabilityScore01(input.reliability01);
  const f = recencyPenaltyScore01(input.fatigueOffersLastHour);
  const e = earningsFitScore01(input.jobPayZar ?? null, input.typicalPayZar ?? null);
  return 0.35 * p + 0.25 * a + 0.15 * r + 0.15 * f + 0.1 * e;
}
