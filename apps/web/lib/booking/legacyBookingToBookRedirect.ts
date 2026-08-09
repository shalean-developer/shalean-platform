import type { BookingServiceId } from "@/components/booking/serviceCategories";
import { findLocationBySlug, normalizeLocationSlugParam } from "@/lib/booking/bookingFlowLocationCatalog";
import {
  BOOKING_ALLOWED_PARAMS,
  copyAllowedBookingParams,
  serviceFromUrlParam,
} from "@/lib/booking/bookingUrl";
import {
  SERVICE_SLUGS,
  type ServiceSlug,
} from "@/src/features/booking-v2/config/serviceConfig";

/** Legacy `/booking/*` checkout segment → booking-v2 step (1–4). */
export type LegacyCheckoutSegment = "details" | "schedule" | "cleaner" | "payment";

const LEGACY_SEGMENT_TO_BOOK_STEP: Record<LegacyCheckoutSegment, number> = {
  details: 1,
  schedule: 2,
  cleaner: 3,
  payment: 4,
};

const LEGACY_SERVICE_TO_BOOK_SLUG: Record<string, ServiceSlug> = {
  standard: "regular-cleaning",
  regular: "regular-cleaning",
  airbnb: "airbnb-cleaning",
  deep: "deep-cleaning",
  move: "moving-cleaning",
  carpet: "carpet-cleaning",
  office: "office-cleaning",
};

export function legacyServiceIdToBookSlug(service: string | null | undefined): ServiceSlug {
  const normalized = serviceFromUrlParam(service ?? undefined);
  if (normalized && LEGACY_SERVICE_TO_BOOK_SLUG[normalized]) {
    return LEGACY_SERVICE_TO_BOOK_SLUG[normalized];
  }
  const raw = String(service ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (raw && LEGACY_SERVICE_TO_BOOK_SLUG[raw]) {
    return LEGACY_SERVICE_TO_BOOK_SLUG[raw];
  }
  for (const slug of SERVICE_SLUGS) {
    if (slug === raw || slug.replace(/-cleaning$/, "") === raw) return slug;
  }
  return "regular-cleaning";
}

export function bookSlugFromLegacyServiceParam(sp: URLSearchParams): ServiceSlug {
  return legacyServiceIdToBookSlug(sp.get("service"));
}

/**
 * Build `/book/{serviceSlug}?step=…` from legacy `/booking/*` query params.
 * Preserves marketing keys ({@link BOOKING_ALLOWED_PARAMS}) for booking-v2 URL prefill.
 */
export function buildBookHrefFromLegacySearchParams(
  sp: URLSearchParams,
  segment: LegacyCheckoutSegment = "details",
): string {
  const slug = bookSlugFromLegacyServiceParam(sp);
  const out = copyAllowedBookingParams(sp);
  out.set("step", String(LEGACY_SEGMENT_TO_BOOK_STEP[segment]));
  const qs = out.toString();
  return qs ? `/book/${slug}?${qs}` : `/book/${slug}?step=${LEGACY_SEGMENT_TO_BOOK_STEP[segment]}`;
}

/** `/book` hub when only service is known (no slug in path yet). */
export function buildBookHubHrefFromLegacySearchParams(sp: URLSearchParams): string {
  const service = sp.get("service");
  if (service?.trim()) {
    return buildBookHrefFromLegacySearchParams(sp, "details");
  }
  const out = copyAllowedBookingParams(sp);
  const qs = out.toString();
  return qs ? `/book?${qs}` : "/book";
}

export type WidgetBookingSelection = {
  service: string;
  bedrooms?: number;
  bathrooms?: number;
  extraRooms?: number;
  extras?: string[];
  serviceAreaName?: string;
  source?: string;
};

/** Preserve widget choices when handing customers to the canonical booking-v2 funnel. */
export function buildBookHrefFromWidgetSelection(input: WidgetBookingSelection): string {
  const sp = new URLSearchParams();
  sp.set("service", input.service);

  for (const [key, value] of [
    ["bedrooms", input.bedrooms],
    ["bathrooms", input.bathrooms],
    ["extraRooms", input.extraRooms],
  ] as const) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      sp.set(key, String(Math.floor(value)));
    }
  }

  const extras = (input.extras ?? []).map((value) => value.trim()).filter(Boolean);
  if (extras.length > 0) sp.set("extras", extras.join(","));

  const location = input.serviceAreaName?.trim();
  if (location) sp.set("location", location);

  const source = input.source?.trim();
  if (source) sp.set("source", source);

  return buildBookHrefFromLegacySearchParams(sp, "details");
}

export function legacyFlowStepQueryToBookHref(step: string | null, sp: URLSearchParams): string {
  const migrated =
    step === "when" || step === "schedule"
      ? buildBookHrefFromLegacySearchParams(sp, "schedule")
      : step === "cleaner"
        ? buildBookHrefFromLegacySearchParams(sp, "cleaner")
        : step === "checkout" || step === "payment" || step === "who"
          ? buildBookHrefFromLegacySearchParams(sp, "payment")
          : buildBookHrefFromLegacySearchParams(sp, "details");
  return migrated;
}

/** Parse legacy marketing URL params into booking-v2 form patches (client hydration). */
export function bookingV2PrefillPatchFromLegacySearchParams(
  sp: URLSearchParams,
): {
  serviceDetails?: Record<string, string | number | boolean>;
  suburb?: string;
  selectedExtras?: string[];
} {
  const patch: {
    serviceDetails?: Record<string, string | number | boolean>;
    suburb?: string;
    selectedExtras?: string[];
  } = {};

  const br = sp.get("bedrooms");
  const bt = sp.get("bathrooms");
  const er = sp.get("extraRooms");
  const details: Record<string, string | number | boolean> = {};
  if (br != null && br !== "") {
    const n = Math.max(1, Math.floor(Number(br)));
    if (Number.isFinite(n)) details.bedrooms = String(n);
  }
  if (bt != null && bt !== "") {
    const n = Math.max(1, Math.floor(Number(bt)));
    if (Number.isFinite(n)) details.bathrooms = String(n);
  }
  if (er != null && er !== "") {
    const n = Math.max(0, Math.floor(Number(er)));
    if (Number.isFinite(n)) details.extraRooms = String(n);
  }
  if (Object.keys(details).length) patch.serviceDetails = details;

  const locRaw = sp.get("location");
  if (locRaw?.trim()) {
    const hit = findLocationBySlug(normalizeLocationSlugParam(locRaw.trim().replace(/\+/g, "-")));
    if (hit?.name) patch.suburb = hit.name;
  }

  const extrasRaw = sp.get("extras");
  if (extrasRaw?.trim()) {
    patch.selectedExtras = extrasRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return patch;
}

export function isLegacyBookingMarketingParam(key: string): key is (typeof BOOKING_ALLOWED_PARAMS)[number] {
  return (BOOKING_ALLOWED_PARAMS as readonly string[]).includes(key);
}

export type { BookingServiceId };
