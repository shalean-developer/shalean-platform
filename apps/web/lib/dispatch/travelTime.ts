const DEFAULT_AVG_SPEED_KMH = 30;

/**
 * Rough drive-time estimate from straight-line distance (city average, Cape Town default).
 */
export function estimateTravelMinutes(distanceKm: number, avgSpeedKmH: number = DEFAULT_AVG_SPEED_KMH): number {
  const d = Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0;
  const v = Number.isFinite(avgSpeedKmH) && avgSpeedKmH > 0 ? avgSpeedKmH : DEFAULT_AVG_SPEED_KMH;
  return (d / v) * 60;
}
