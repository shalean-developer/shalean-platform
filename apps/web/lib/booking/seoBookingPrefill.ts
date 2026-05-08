import type { BookingServiceId } from "@/components/booking/serviceCategories";
import { buildBookingQueryString } from "@/lib/booking/bookingUrl";

export type SeoBookingPrefill = {
  service?: BookingServiceId | null;
  locationSlug?: string | null;
  extras?: readonly string[] | null;
  source?: string | null;
};

type SeoBookingStep = "entry" | "details" | "when" | "checkout";

const SEO_BOOKING_STEP_PATH: Record<SeoBookingStep, string> = {
  entry: "/booking/details",
  details: "/booking/details",
  when: "/booking/schedule",
  checkout: "/booking/payment",
};

const SEO_SERVICE_EXTRAS: Record<BookingServiceId, string[]> = {
  quick: ["inside-fridge"],
  standard: ["inside-fridge"],
  airbnb: ["inside-fridge", "laundry"],
  deep: ["inside-oven", "interior-walls", "inside-cabinets"],
  move: ["inside-oven", "inside-cabinets", "interior-walls"],
  carpet: ["mattress-cleaning"],
};

export function inferBookingServiceFromSeoSlug(slug: string): BookingServiceId {
  const s = slug.toLowerCase();
  if (s.includes("airbnb")) return "airbnb";
  if (s.includes("move-out") || s.includes("move-in") || s.includes("move_cleaning")) return "move";
  if (s.includes("deep")) return "deep";
  if (s.includes("carpet")) return "carpet";
  return "standard";
}

export function locationSlugFromSeoLocationSlug(slug: string): string {
  return slug.replace(/-cleaning-services$/i, "");
}

export function locationSlugFromSeoSuburb(suburb: string): string {
  return suburb
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function recommendedSeoExtras(service: BookingServiceId): string[] {
  return SEO_SERVICE_EXTRAS[service] ?? [];
}

export function buildSeoBookingHref(step: SeoBookingStep, prefill: SeoBookingPrefill): string {
  const extra: Record<string, string> = {};
  if (prefill.service) extra.service = prefill.service;
  if (prefill.locationSlug) extra.location = prefill.locationSlug;
  const extras = [...new Set(prefill.extras ?? [])].filter(Boolean);
  if (extras.length > 0) extra.extras = extras.join(",");
  if (prefill.source) extra.source = prefill.source;
  const qs = buildBookingQueryString(extra);
  return qs ? `${SEO_BOOKING_STEP_PATH[step]}?${qs}` : SEO_BOOKING_STEP_PATH[step];
}
