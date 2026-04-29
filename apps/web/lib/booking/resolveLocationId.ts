import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Maps free-text booking/cleaner labels to `locations.id` via kebab-case slug
 * (same rule as SQL: `lower(regexp_replace(trim(label), '\s+', '-', 'g'))`).
 */
export function locationLabelToSlug(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

/**
 * Resolves a suburb/area label to `public.locations.id` when a row exists.
 */
export async function resolveLocationIdFromLabel(
  supabase: SupabaseClient,
  label: string | null | undefined,
): Promise<string | null> {
  const t = typeof label === "string" ? label.trim() : "";
  if (!t) return null;
  const slug = locationLabelToSlug(t);
  if (!slug) return null;

  const { data, error } = await supabase.from("locations").select("id").eq("slug", slug).maybeSingle();

  if (error) {
    return null;
  }
  const id = data && typeof data === "object" && "id" in data ? String((data as { id: string }).id) : null;
  return id || null;
}

export async function resolveLocationContextFromLabel(
  supabase: SupabaseClient,
  label: string | null | undefined,
): Promise<{ locationId: string | null; cityId: string | null }> {
  const t = typeof label === "string" ? label.trim() : "";
  if (!t) return { locationId: null, cityId: null };
  const slug = locationLabelToSlug(t);
  if (!slug) return { locationId: null, cityId: null };
  const { data } = await supabase.from("locations").select("id, city_id").eq("slug", slug).maybeSingle();
  if (!data || typeof data !== "object") return { locationId: null, cityId: null };
  return {
    locationId: "id" in data ? String((data as { id: string }).id) : null,
    cityId: "city_id" in data ? String((data as { city_id?: string | null }).city_id ?? "") || null : null,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BookingLocationSource = {
  /** Free-text street / unit (optional). */
  location?: string | null;
  /** Canonical `public.locations.id` from structured suburb picker. */
  serviceAreaLocationId?: string | null;
  serviceAreaCityId?: string | null;
};

/**
 * Prefer structured `serviceAreaLocationId` from the funnel; otherwise resolve from free-text `location`.
 */
export async function resolveBookingLocationContext(
  supabase: SupabaseClient,
  source: BookingLocationSource | null | undefined,
): Promise<{ locationId: string | null; cityId: string | null }> {
  const sid = typeof source?.serviceAreaLocationId === "string" ? source.serviceAreaLocationId.trim() : "";
  if (sid && UUID_RE.test(sid)) {
    const cid = typeof source?.serviceAreaCityId === "string" ? source.serviceAreaCityId.trim() : "";
    return { locationId: sid.toLowerCase(), cityId: cid && UUID_RE.test(cid) ? cid.toLowerCase() : null };
  }
  return resolveLocationContextFromLabel(supabase, source?.location?.trim() ?? null);
}
