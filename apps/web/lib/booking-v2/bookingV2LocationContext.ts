import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLocationContextFromLabel } from "@/lib/booking/resolveLocationId";

export type BookingV2LocationContext = {
  locationId: string;
  cityId: string | null;
  latitude: number | null;
  longitude: number | null;
};

function coordsFromRow(data: {
  latitude?: number | null;
  longitude?: number | null;
}): { latitude: number; longitude: number } | null {
  const latitude = data.latitude;
  const longitude = data.longitude;
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
  return coordsFromRow(data as { latitude?: number | null; longitude?: number | null });
}

/**
 * Prefer structured `locations.id` from the booking funnel (same as resolveBookingLocationContext).
 */
export async function loadBookingV2LocationContextById(
  admin: SupabaseClient,
  locationId: string,
): Promise<BookingV2LocationContext | null> {
  const id = locationId.trim();
  if (!id) return null;

  const { data, error } = await admin
    .from("locations")
    .select("id, city_id, latitude, longitude")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    id: string;
    city_id?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  const coords = coordsFromRow(row);
  const cityId = String(row.city_id ?? "").trim() || null;

  return {
    locationId: String(row.id),
    cityId,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
  };
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
