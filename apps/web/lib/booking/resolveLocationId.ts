import type { SupabaseClient } from "@supabase/supabase-js";

const LOCATIONS_CACHE_TTL_MS = 60_000;
let locationsCache: { rows: { id: string; name: string; slug: string | null; city_id: string | null }[]; at: number } | null =
  null;

async function fetchAllLocationsForMatch(
  supabase: SupabaseClient,
): Promise<{ id: string; name: string; slug: string | null; city_id: string | null }[]> {
  const now = Date.now();
  if (locationsCache && now - locationsCache.at < LOCATIONS_CACHE_TTL_MS) {
    return locationsCache.rows;
  }
  const { data, error } = await supabase.from("locations").select("id, name, slug, city_id");
  if (error || !Array.isArray(data)) {
    return locationsCache?.rows ?? [];
  }
  const rows = data as { id: string; name: string; slug: string | null; city_id: string | null }[];
  locationsCache = { rows, at: now };
  return rows;
}

async function resolveDefaultCityId(supabase: SupabaseClient): Promise<string | null> {
  const slug = (process.env.DEFAULT_ASSIGN_CITY_SLUG ?? "cape-town").trim().toLowerCase() || "cape-town";
  const { data } = await supabase.from("cities").select("id").eq("slug", slug).maybeSingle();
  if (data && typeof data === "object" && "id" in data) {
    const id = String((data as { id: string }).id ?? "").trim();
    return id || null;
  }
  return null;
}

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
  if (slug) {
    const { data } = await supabase.from("locations").select("id, city_id").eq("slug", slug).maybeSingle();
    if (data && typeof data === "object") {
      return {
        locationId: "id" in data ? String((data as { id: string }).id) : null,
        cityId: "city_id" in data ? String((data as { city_id?: string | null }).city_id ?? "") || null : null,
      };
    }
  }

  const low = t.toLowerCase();
  const rows = await fetchAllLocationsForMatch(supabase);
  const sorted = [...rows].sort((a, b) => String(b.name ?? "").length - String(a.name ?? "").length);
  for (const row of sorted) {
    const nm = String(row.name ?? "").trim();
    if (nm.length < 4) continue;
    if (low.includes(nm.toLowerCase())) {
      const cityId = row.city_id ? String(row.city_id).trim() : "";
      return {
        locationId: String(row.id).trim(),
        cityId: cityId || null,
      };
    }
  }

  const fallbackCity = await resolveDefaultCityId(supabase);
  console.warn("[resolveLocationContextFromLabel] INVALID LOCATION", t.slice(0, 120), { cityFallback: Boolean(fallbackCity) });
  return { locationId: null, cityId: fallbackCity };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BookingLocationSource = {
  /** Free-text street / unit (optional). */
  location?: string | null;
  /** `public.locations.slug` from URL or compact funnel (resolved server-side to UUID). */
  locationSlug?: string | null;
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
  const rawSlug = typeof source?.locationSlug === "string" ? source.locationSlug.trim().toLowerCase() : "";
  if (rawSlug) {
    const { data } = await supabase.from("locations").select("id, city_id").eq("slug", rawSlug).maybeSingle();
    if (data && typeof data === "object" && "id" in data) {
      const lid = String((data as { id: string }).id ?? "").trim();
      const cid = String((data as { city_id?: string | null }).city_id ?? "").trim();
      return { locationId: lid || null, cityId: cid || null };
    }
  }

  const sid = typeof source?.serviceAreaLocationId === "string" ? source.serviceAreaLocationId.trim() : "";
  if (sid && UUID_RE.test(sid)) {
    const cid = typeof source?.serviceAreaCityId === "string" ? source.serviceAreaCityId.trim() : "";
    return { locationId: sid.toLowerCase(), cityId: cid && UUID_RE.test(cid) ? cid.toLowerCase() : null };
  }
  return resolveLocationContextFromLabel(supabase, source?.location?.trim() ?? null);
}
