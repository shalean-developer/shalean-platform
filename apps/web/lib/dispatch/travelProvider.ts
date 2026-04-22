import { haversineDistanceKm } from "@/lib/dispatch/distance";
import { createGoogleTravelTimeProvider } from "@/lib/dispatch/providers/googleTravelProvider";
import type { LatLng, TravelTimeProvider } from "@/lib/dispatch/travelProviderTypes";
import { estimateTravelMinutes } from "@/lib/dispatch/travelTime";

export type { LatLng, TravelTimeProvider } from "@/lib/dispatch/travelProviderTypes";

/**
 * Straight-line distance → drive-time heuristic (same as legacy v2 estimate).
 * Used when no Google key or as API fallback inside Google provider.
 */
export class HaversineEstimateTravelProvider implements TravelTimeProvider {
  async getTravelTimeMinutes(params: { origin: LatLng; destination: LatLng }): Promise<number> {
    const km = haversineDistanceKm(params.origin.lat, params.origin.lng, params.destination.lat, params.destination.lng);
    return estimateTravelMinutes(km);
  }
}

let cachedDefault: TravelTimeProvider | undefined;

/** Google when `GOOGLE_MAPS_API_KEY` is set; otherwise Haversine+speed heuristic. */
export function getDefaultTravelTimeProvider(): TravelTimeProvider {
  if (cachedDefault) return cachedDefault;
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  cachedDefault = key ? createGoogleTravelTimeProvider(key) : new HaversineEstimateTravelProvider();
  return cachedDefault;
}
