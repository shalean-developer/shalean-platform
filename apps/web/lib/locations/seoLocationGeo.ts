import type { BookingLocationRecord } from "@/lib/locations/seoBookingLocations";
import { BOOKING_LOCATION_CATALOG } from "@/lib/locations/seoBookingLocations";
import { SEO_LOCATION_COORDS } from "@/lib/locations/seoLocationCoords";

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/**
 * Picks the catalogue row with the smallest great-circle distance to `coords`.
 * Only considers rows that exist in `SEO_LOCATION_COORDS`.
 */
export function findNearestBookingLocation(coords: { lat: number; lng: number }): BookingLocationRecord | null {
  let best: BookingLocationRecord | null = null;
  let bestKm = Infinity;
  for (const loc of BOOKING_LOCATION_CATALOG) {
    const c = SEO_LOCATION_COORDS[loc.slug];
    if (!c) continue;
    const km = haversineKm(coords, c);
    if (km < bestKm) {
      bestKm = km;
      best = loc;
    }
  }
  return best;
}
