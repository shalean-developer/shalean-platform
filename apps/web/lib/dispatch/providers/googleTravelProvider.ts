import { haversineDistanceKm } from "@/lib/dispatch/distance";
import type { LatLng, TravelTimeProvider } from "@/lib/dispatch/travelProviderTypes";
import { estimateTravelMinutes } from "@/lib/dispatch/travelTime";

const CACHE_TTL_MS = 5 * 60_000;

type CacheEntry = { expires: number; minutes: number };

function cacheKey(a: LatLng, b: LatLng): string {
  const r = (n: number) => n.toFixed(4);
  return `${r(a.lat)},${r(a.lng)}|${r(b.lat)},${r(b.lng)}`;
}

export function createGoogleTravelTimeProvider(apiKey: string): TravelTimeProvider {
  const cache = new Map<string, CacheEntry>();

  const fallbackMinutes = async (p: { origin: LatLng; destination: LatLng }): Promise<number> => {
    const km = haversineDistanceKm(p.origin.lat, p.origin.lng, p.destination.lat, p.destination.lng);
    return estimateTravelMinutes(km);
  };

  return {
    async getTravelTimeMinutes(params: { origin: LatLng; destination: LatLng }): Promise<number> {
      const key = cacheKey(params.origin, params.destination);
      const now = Date.now();
      const hit = cache.get(key);
      if (hit && hit.expires > now) return hit.minutes;

      const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
      url.searchParams.set("origins", `${params.origin.lat},${params.origin.lng}`);
      url.searchParams.set("destinations", `${params.destination.lat},${params.destination.lng}`);
      url.searchParams.set("mode", "driving");
      url.searchParams.set("departure_time", "now");
      url.searchParams.set("traffic_model", "best_guess");
      url.searchParams.set("key", apiKey);

      try {
        const res = await fetch(url.toString(), { next: { revalidate: 0 } });
        if (!res.ok) {
          return fallbackMinutes(params);
        }
        const data = (await res.json()) as {
          status?: string;
          rows?: Array<{
            elements?: Array<{
              status?: string;
              duration?: { value?: number };
              duration_in_traffic?: { value?: number };
            }>;
          }>;
        };
        if (data.status !== "OK") {
          return fallbackMinutes(params);
        }
        const el = data.rows?.[0]?.elements?.[0];
        if (!el || el.status !== "OK") {
          return fallbackMinutes(params);
        }
        const sec = el.duration_in_traffic?.value ?? el.duration?.value;
        if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 0) {
          return fallbackMinutes(params);
        }
        const minutes = sec / 60;
        cache.set(key, { expires: now + CACHE_TTL_MS, minutes });
        return minutes;
      } catch {
        return fallbackMinutes(params);
      }
    },
  };
}
