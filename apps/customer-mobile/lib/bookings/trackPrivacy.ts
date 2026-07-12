import type { CustomerTrackPoint } from "@/services/types/customerTrack";

/**
 * Client-side privacy mirror of the track API:
 * never expose coordinates unless the server says the booking is trackable.
 */
export function shouldExposeTrackPoint(
  trackable: boolean,
  point: CustomerTrackPoint | null | undefined,
): CustomerTrackPoint | null {
  if (!trackable) return null;
  if (!point) return null;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    lat,
    lng,
    created_at: point.created_at ?? null,
  };
}

export function buildGoogleMapsEmbedUrl(lat: number, lng: number): string {
  const safeLat = Math.min(90, Math.max(-90, lat));
  const safeLng = Math.min(180, Math.max(-180, lng));
  return `https://www.google.com/maps?q=${encodeURIComponent(`${safeLat},${safeLng}`)}&z=16&output=embed`;
}

export function buildGoogleMapsOpenUrl(lat: number, lng: number): string {
  const safeLat = Math.min(90, Math.max(-90, lat));
  const safeLng = Math.min(180, Math.max(-180, lng));
  return `https://www.google.com/maps?q=${encodeURIComponent(`${safeLat},${safeLng}`)}`;
}
