import { haversineDistanceKm } from "@/lib/dispatch/distance";

export { haversineDistanceKm as getDistanceKmBetweenCoordinates } from "@/lib/dispatch/distance";

/**
 * Great-circle distance (km) between two WGS84 points — same math as {@link haversineDistanceKm}.
 */
export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineDistanceKm(lat1, lon1, lat2, lon2);
}

/**
 * Deterministic dispatch score: closer + higher rating wins.
 * - Distance term: `1 / (distanceKm + 1)` (higher when nearer).
 * - Rating term: `rating / 5` on [0, 1] when rating is on a 0–5 scale.
 */
export function computeDistanceRatingDispatchScore(distanceKm: number, rating: number): number {
  const d = Number.isFinite(distanceKm) && distanceKm >= 0 ? distanceKm : 0;
  const r = Number.isFinite(rating) ? Math.min(5, Math.max(0, rating)) : 0;
  return (1 / (d + 1)) * 0.6 + (r / 5) * 0.4;
}

export type ScoredCleaner<T extends { id: string }> = T & { score: number; distance_km: number };

/**
 * Sort best-first: score desc, then distance asc, then id asc (stable / deterministic).
 */
export function sortDispatchCandidatesByScore<T extends { id: string; score: number; distance_km: number }>(
  rows: T[],
): T[] {
  return rows.slice().sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.distance_km !== b.distance_km) return a.distance_km - b.distance_km;
    return a.id.localeCompare(b.id);
  });
}
