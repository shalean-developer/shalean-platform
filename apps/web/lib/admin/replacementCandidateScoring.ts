/**
 * Smart replacement ranking for emergency roster reassignment.
 * Subscores are 0–100; final score is 0–100 (weighted blend).
 */

export type AvailabilityLabel = "available" | "busy" | "unavailable";

/** Haversine distance in km; null if inputs invalid. */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number | null {
  if (![lat1, lon1, lat2, lon2].every((x) => typeof x === "number" && Number.isFinite(x))) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function distanceScoreFromKm(distanceKm: number | null): number {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return 50;
  if (distanceKm <= 5) return 100;
  if (distanceKm <= 10) return 70;
  if (distanceKm <= 20) return 40;
  return 10;
}

export function ratingSubscore(rating: number | null | undefined): number {
  const r = typeof rating === "number" && Number.isFinite(rating) ? Math.min(5, Math.max(0, rating)) : 3.5;
  return (r / 5) * 100;
}

export function availabilityScoreFromLabel(label: AvailabilityLabel): number {
  switch (label) {
    case "available":
      return 100;
    case "busy":
      return 30;
    default:
      return 0;
  }
}

/** Reliability without cancellation telemetry: lean on completed job volume. */
export function reliabilityScoreFromJobs(jobsCompleted: number | null | undefined): number {
  const j = typeof jobsCompleted === "number" && Number.isFinite(jobsCompleted) ? Math.max(0, jobsCompleted) : 0;
  return Math.min(100, 25 + j * 0.45);
}

/**
 * Weighted composite (max 100):
 * rating 20%, availability 25%, distance 25%, reliability 30%
 */
export function compositeReplacementScore(parts: {
  rating: number;
  availability: number;
  distance: number;
  reliability: number;
}): number {
  const raw =
    parts.rating * 0.2 + parts.availability * 0.25 + parts.distance * 0.25 + parts.reliability * 0.3;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

export function labelFromCleanerState(args: {
  status: string | null | undefined;
  isAvailable: boolean | null | undefined;
  slotOverlap: boolean;
}): AvailabilityLabel {
  const st = String(args.status ?? "").toLowerCase();
  if (st === "offline") return "unavailable";
  if (args.slotOverlap) return "busy";
  if (st === "busy" || args.isAvailable === false) return "busy";
  return "available";
}
