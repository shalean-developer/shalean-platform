import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingLocationSlug } from "@/lib/locations/bookingLocations";

const LOCATIONS_CACHE_TTL_MS = 60_000;
let locationsCache: { rows: { id: string; name: string; slug: string | null; city_id: string | null }[]; at: number } | null =
  null;

/** Align free-text resolve with booking catalog slug rules (apostrophes, aliases). */
const RESOLVE_SLUG_ALIASES: Record<string, string> = {
  "d-urbanvale": "durbanville",
  durbanvale: "durbanville",
  "cape-town-cbd": "cape-town",
  tableview: "table-view",
  "simons-town": "simons-town",
  "devils-peak-estate": "devils-peak-estate",
  "va-waterfront": "waterfront",
  "v-a-waterfront": "waterfront",
};

export function normalizeLocationResolveSlug(label: string): string {
  const raw = bookingLocationSlug(label);
  if (!raw || raw === "other") return "";
  return RESOLVE_SLUG_ALIASES[raw] ?? raw;
}

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
 * Maps free-text booking/cleaner labels to a locations slug candidate.
 * Uses the same normalisation as the booking suburb catalog (strips apostrophes,
 * punctuation → kebab-case) plus known aliases (e.g. D'urbanvale → durbanville).
 */
export function locationLabelToSlug(label: string): string {
  return normalizeLocationResolveSlug(label);
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

function rowToContext(row: {
  id: string;
  city_id?: string | null;
}): { locationId: string; cityId: string | null } {
  const cityId = row.city_id ? String(row.city_id).trim() : "";
  return {
    locationId: String(row.id).trim(),
    cityId: cityId || null,
  };
}

export async function resolveLocationContextFromLabel(
  supabase: SupabaseClient,
  label: string | null | undefined,
): Promise<{ locationId: string | null; cityId: string | null }> {
  const t = typeof label === "string" ? label.trim() : "";
  if (!t || t.toLowerCase() === "other") {
    return { locationId: null, cityId: null };
  }

  const slug = locationLabelToSlug(t);
  if (slug) {
    const { data } = await supabase.from("locations").select("id, city_id").eq("slug", slug).maybeSingle();
    if (data && typeof data === "object" && "id" in data) {
      return rowToContext(data as { id: string; city_id?: string | null });
    }
  }

  const low = t.toLowerCase();
  const rows = await fetchAllLocationsForMatch(supabase);

  // Exact name match (case / whitespace insensitive) before substring heuristics.
  for (const row of rows) {
    const nm = String(row.name ?? "").trim().toLowerCase();
    if (nm && nm === low) {
      return rowToContext(row);
    }
  }

  // Slug equality after normalising DB slug the same way as labels.
  if (slug) {
    for (const row of rows) {
      const rowSlug = row.slug ? normalizeLocationResolveSlug(row.slug) : normalizeLocationResolveSlug(String(row.name ?? ""));
      if (rowSlug && rowSlug === slug) {
        return rowToContext(row);
      }
    }
  }

  const sorted = [...rows].sort((a, b) => String(b.name ?? "").length - String(a.name ?? "").length);
  for (const row of sorted) {
    const nm = String(row.name ?? "").trim();
    if (nm.length < 4) continue;
    if (low.includes(nm.toLowerCase()) || nm.toLowerCase().includes(low)) {
      return rowToContext(row);
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
