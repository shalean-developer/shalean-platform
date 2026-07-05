import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLocationContextFromLabel } from "@/lib/booking/resolveLocationId";

export type BookingV2LocationContext = {
  locationId: string;
  cityId: string | null;
  latitude: number | null;
  longitude: number | null;
};

export async function loadLocationCoordinates(
  admin: SupabaseClient,
  locationId: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const id = locationId.trim();
  if (!id) return null;

  const { data, error } = await admin
    .from("locations")
    .select("latitude, longitude")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const latitude = (data as { latitude?: number | null }).latitude;
  const longitude = (data as { longitude?: number | null }).longitude;
  if (
    latitude == null ||
    longitude == null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return { latitude, longitude };
}

/**
 * Resolve suburb label → DB location row + coordinates (required for dispatch v4).
 * Returns null when suburb cannot be mapped to a known service area.
 */
export async function resolveBookingV2LocationContext(
  admin: SupabaseClient,
  suburb: string,
): Promise<BookingV2LocationContext | null> {
  const label = suburb.trim();
  if (!label) return null;

  const { locationId, cityId } = await resolveLocationContextFromLabel(admin, label);
  if (!locationId) return null;

  const coords = await loadLocationCoordinates(admin, locationId);

  return {
    locationId,
    cityId,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
  };
}
