import { findLocationBySlug, normalizeLocationSlugParam } from "@/lib/booking/bookingFlowLocationCatalog";
import { parseBookingServiceId } from "@/components/booking/serviceCategories";
import type { BookingCheckoutState } from "@/lib/booking/bookingCheckoutStore";

function sanitizePromoUrlParam(raw: string | null): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (t.length < 2 || t.length > 32) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(t)) return null;
  return t.toUpperCase();
}

/** Query keys preserved across booking navigation and marketing links. */
export const BOOKING_ALLOWED_PARAMS = [
  "service",
  "bedrooms",
  "bathrooms",
  "extraRooms",
  "promo",
  "source",
  "location",
  "register",
] as const;

export type BookingAllowedParamKey = (typeof BOOKING_ALLOWED_PARAMS)[number];

export type BookingSearchParamSource = { get(name: string): string | null };

/** Keep only allowed keys (drops `step`, UTM noise, etc.). */
export function copyAllowedBookingParams(from: BookingSearchParamSource): URLSearchParams {
  const out = new URLSearchParams();
  for (const key of BOOKING_ALLOWED_PARAMS) {
    const v = from.get(key);
    if (v != null && v !== "") out.set(key, v);
  }
  return out;
}

export function buildBookingQueryString(
  params: Partial<Record<BookingAllowedParamKey, string | number | null | undefined>>,
): string {
  const sp = new URLSearchParams();
  for (const key of BOOKING_ALLOWED_PARAMS) {
    const v = params[key];
    if (v === undefined || v === null || v === "") continue;
    sp.set(key, String(v));
  }
  return sp.toString();
}

/**
 * Append current (or provided) search params to a path, keeping only {@link BOOKING_ALLOWED_PARAMS}.
 * Safe on the client when `from` is omitted (uses `window.location.search`).
 */
export function withBookingQuery(path: string, from?: BookingSearchParamSource | null): string {
  const base =
    from ??
    (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null);
  if (!base) return path;
  const filtered = copyAllowedBookingParams(base);
  const qs = filtered.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Client-only snapshot of allowed query keys (e.g. one-time hydration). */
export function getBookingQueryFromUrl(): Partial<Record<BookingAllowedParamKey, string>> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const result: Partial<Record<BookingAllowedParamKey, string>> = {};
  for (const key of BOOKING_ALLOWED_PARAMS) {
    const value = params.get(key);
    if (value) result[key] = value;
  }
  return result;
}

export function serviceFromUrlParam(raw: string | null | undefined): string | undefined {
  if (raw == null) return undefined;
  const t = raw.trim().toLowerCase().replace(/_/g, "-");
  if (!t) return undefined;
  if (t === "deep" || t === "deep-cleaning" || t === "deep-clean" || t === "deep_cleaning") return "deep";
  if (t === "standard" || t === "standard-cleaning" || t === "standard_cleaning") return "standard";
  if (t === "move" || t === "move-out" || t === "move-out-cleaning" || t === "move_out_cleaning" || t === "move-cleaning")
    return "move";
  const parsed = parseBookingServiceId(t);
  return parsed ?? undefined;
}

export function locationPatchFromUrlParam(
  raw: string | null | undefined,
): Partial<
  Pick<
    BookingCheckoutState,
    "location" | "locationSlug" | "serviceAreaLocationId" | "serviceAreaCityId" | "serviceAreaName"
  >
> | undefined {
  if (raw == null) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  const hit = findLocationBySlug(normalizeLocationSlugParam(s.replace(/\+/g, "-")));
  if (hit) {
    return {
      locationSlug: hit.slug,
      serviceAreaName: hit.name,
      serviceAreaLocationId: null,
      serviceAreaCityId: null,
    };
  }
  return { location: s };
}

const ROOM_KEYS = ["bedrooms", "bathrooms", "extraRooms"] as const;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw === "") return fallback;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

/** Maps allowed URL params into a {@link useBookingCheckoutStore} patch (service + location normalized). */
export function bookingEntryPatchFromSearchParams(
  sp: URLSearchParams,
): Partial<BookingCheckoutState> {
  const patch: Partial<BookingCheckoutState> = {};
  const svc = serviceFromUrlParam(sp.get("service"));
  if (svc !== undefined) patch.service = svc;

  const loc = locationPatchFromUrlParam(sp.get("location"));
  if (loc !== undefined) Object.assign(patch, loc);

  const br = parsePositiveInt(sp.get("bedrooms") ?? undefined, 2);
  const bt = parsePositiveInt(sp.get("bathrooms") ?? undefined, 1);
  const er = parsePositiveInt(sp.get("extraRooms") ?? undefined, 0);
  if (sp.has("bedrooms")) patch.bedrooms = Math.max(1, br);
  if (sp.has("bathrooms")) patch.bathrooms = Math.max(1, bt);
  if (sp.has("extraRooms")) patch.extraRooms = er;

  const sanitizedPromo = sanitizePromoUrlParam(sp.get("promo"));
  if (sanitizedPromo) patch.promo = sanitizedPromo;

  if (Object.keys(patch).length > 0) {
    const hasServiceOrRooms =
      patch.service !== undefined ||
      ROOM_KEYS.some((k) => k in patch) ||
      patch.location !== undefined ||
      patch.locationSlug !== undefined;
    if (hasServiceOrRooms) patch.detailsFlowPhase = "home-details";
  }

  return patch;
}
