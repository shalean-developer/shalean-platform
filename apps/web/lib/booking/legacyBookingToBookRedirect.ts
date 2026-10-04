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
import { extraSlugsForService } from "@/lib/booking-v2/serviceExtraSlugs";

/** Legacy `/booking/*` checkout segment → booking-v2 step (1–4). */
export type LegacyCheckoutSegment = "details" | "schedule" | "cleaner" | "payment";

const LEGACY_SEGMENT_TO_BOOK_STEP: Record<LegacyCheckoutSegment, string> = {
  details: "details",
  schedule: "schedule",
  cleaner: "review",
  payment: "payment",
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

export function explicitBookServiceSlugFromParam(
  service: string | null | undefined,
): ServiceSlug | null {
  const raw = String(service ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

  if (!raw) return null;

  // Booking V2 canonical slugs must win before the retired-funnel parser.
  // The legacy parser intentionally maps office-cleaning -> standard, which is
  // correct for the old funnel but wrong for /book/[serviceSlug].
  for (const slug of SERVICE_SLUGS) {
    if (slug === raw || slug.replace(/-cleaning$/, "") === raw) return slug;
  }

  if (LEGACY_SERVICE_TO_BOOK_SLUG[raw]) {
    return LEGACY_SERVICE_TO_BOOK_SLUG[raw];
  }

  const normalized = serviceFromUrlParam(service ?? undefined);
  if (normalized && LEGACY_SERVICE_TO_BOOK_SLUG[normalized]) {
    return LEGACY_SERVICE_TO_BOOK_SLUG[normalized];
  }

  return null;
}

export function legacyServiceIdToBookSlug(service: string | null | undefined): ServiceSlug {
  return explicitBookServiceSlugFromParam(service) ?? "regular-cleaning";
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
  out.set("step", LEGACY_SEGMENT_TO_BOOK_STEP[segment]);
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

/** Preserve referral/marketing context when a service is selected on the /book hub. */
export function buildBookServiceSelectionHref(
  sp: URLSearchParams,
  serviceSlug: ServiceSlug,
): string {
  const next = new URLSearchParams(sp);
  next.set("service", serviceSlug);
  const href = buildBookHrefFromLegacySearchParams(next, "details");
  return `${href}&section=address`;
}

export type WidgetBookingSelection = {
  service: string;
  bedrooms?: number;
  bathrooms?: number;
  extraRooms?: number;
  extras?: string[];
  serviceAreaName?: string;
  serviceAreaLocationId?: string | null;
  source?: string;
};

/** Preserve widget choices when handing customers to the canonical booking-v2 funnel. */
export function buildBookHrefFromWidgetSelection(input: WidgetBookingSelection): string {
  const sp = new URLSearchParams();
  sp.set("service", input.service);
  const serviceSlug = legacyServiceIdToBookSlug(input.service);

  for (const [key, value] of [
    ["bedrooms", input.bedrooms],
    ["bathrooms", input.bathrooms],
    ["extraRooms", input.extraRooms],
  ] as const) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      sp.set(key, String(Math.floor(value)));
    }
  }

  const allowedExtras = new Set(extraSlugsForService(serviceSlug));
  const extras = (input.extras ?? [])
    .map((value) => value.trim())
    .filter((value) => value && allowedExtras.has(value));
  if (extras.length > 0) sp.set("extras", extras.join(","));
  sp.set("extrasMode", "replace");

  const location = input.serviceAreaName?.trim();
  const locationId = input.serviceAreaLocationId?.trim();
  if (location && locationId) {
    sp.set("serviceAreaLocationId", locationId);
    sp.set("serviceAreaName", location);
  } else if (location) {
    sp.set("location", location);
  }

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
  replaceSelectedExtras?: boolean;
} {
  const patch: {
    serviceDetails?: Record<string, string | number | boolean>;
    suburb?: string;
    selectedExtras?: string[];
    replaceSelectedExtras?: boolean;
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
  const serviceAreaLocationId = sp.get("serviceAreaLocationId")?.trim() ?? "";
  const serviceAreaName = sp.get("serviceAreaName")?.trim() ?? "";
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      serviceAreaLocationId,
    ) &&
    serviceAreaName
  ) {
    patch.suburb = serviceAreaName.slice(0, 120);
  } else if (locRaw?.trim()) {
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
  patch.replaceSelectedExtras = sp.get("extrasMode") === "replace";

  return patch;
}

export function isLegacyBookingMarketingParam(key: string): key is (typeof BOOKING_ALLOWED_PARAMS)[number] {
  return (BOOKING_ALLOWED_PARAMS as readonly string[]).includes(key);
}

export type { BookingServiceId };
