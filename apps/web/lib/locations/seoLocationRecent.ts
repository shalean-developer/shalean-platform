import type { BookingLocationRecord } from "@/lib/locations/seoBookingLocations";

const STORAGE_KEY = "shalean-seo-location-recent-v1";

export type SeoLocationRecentPayload = {
  slug: string;
  label: string;
  seoSlug: string;
  savedAt: number;
};

export function readRecentSeoLocation(): SeoLocationRecentPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (typeof o.slug !== "string" || typeof o.label !== "string" || typeof o.seoSlug !== "string") return null;
    return { slug: o.slug, label: o.label, seoSlug: o.seoSlug, savedAt: typeof o.savedAt === "number" ? o.savedAt : Date.now() };
  } catch {
    return null;
  }
}

export function writeRecentSeoLocation(loc: Pick<BookingLocationRecord, "slug" | "label" | "seoSlug">): void {
  if (typeof window === "undefined") return;
  try {
    const payload: SeoLocationRecentPayload = {
      slug: loc.slug,
      label: loc.label,
      seoSlug: loc.seoSlug,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}
