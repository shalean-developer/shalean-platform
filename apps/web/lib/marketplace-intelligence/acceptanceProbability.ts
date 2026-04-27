/**
 * Context-specific acceptance likelihood (0–1), not a trained ML model — fast heuristic for dispatch ranking.
 */
export type AcceptanceModelInput = {
  distanceKm: number;
  acceptanceRecent: number;
  acceptanceLifetime: number;
  recentDeclines: number;
  fatigueOffersLastHour: number;
  /** Hour 0–23 for slot start (job local / booking time). */
  hourOfDay: number;
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Higher → more likely to accept this offer (distance, history, fatigue, time-of-day).
 */
export function predictAcceptanceProbability(input: AcceptanceModelInput): number {
  const d = Math.max(0, input.distanceKm);
  const distFactor = clamp01(1 / (1 + d / 12));

  const accR = clamp01(Number.isFinite(input.acceptanceRecent) ? input.acceptanceRecent : 0.5);
  const accL = clamp01(Number.isFinite(input.acceptanceLifetime) ? input.acceptanceLifetime : 0.5);
  const accBlend = 0.65 * accR + 0.35 * accL;

  const declineDrag = clamp01(1 - Math.min(0.45, input.recentDeclines * 0.08));
  const fatigueDrag = clamp01(1 - Math.min(0.35, input.fatigueOffersLastHour * 0.04));

  const h = input.hourOfDay;
  const peakPenalty = h >= 7 && h <= 9 || h >= 16 && h <= 19 ? 0.92 : 1;

  const raw = distFactor * 0.28 + accBlend * 0.52 + declineDrag * 0.12 + fatigueDrag * 0.08;
  return Math.round(clamp01(raw * peakPenalty) * 1000) / 1000;
}
