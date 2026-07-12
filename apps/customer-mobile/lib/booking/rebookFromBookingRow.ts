import { defaultBookingFormData } from "@/lib/booking/defaultForm";
import {
  defaultCleanerMode,
  isServiceSlug,
  SERVICE_LABELS,
  type CleanerMode,
  type ServiceSlug,
} from "@/lib/booking/serviceMeta";
import type { BookingFormData } from "@/lib/booking/types";
import type { CustomerBookingRow } from "@/services/types/customerBookings";

/** Canonical DB service_slug → booking-v2 path slug. */
const CANONICAL_TO_V2: Record<string, ServiceSlug> = {
  standard: "regular-cleaning",
  deep: "deep-cleaning",
  move: "moving-cleaning",
  office: "office-cleaning",
  carpet: "carpet-cleaning",
  airbnb: "airbnb-cleaning",
};

const LABEL_TO_SLUG: Record<string, ServiceSlug> = Object.fromEntries(
  Object.entries(SERVICE_LABELS).map(([slug, label]) => [label.toLowerCase(), slug as ServiceSlug]),
) as Record<string, ServiceSlug>;

function serviceDetailsFromRow(
  details: Record<string, unknown> | null | undefined,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!details || typeof details !== "object") return out;
  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

/** Resolve booking-v2 service slug from a persisted row (no web imports). */
export function bookingServiceSlugFromBookingRow(
  row: Pick<CustomerBookingRow, "service" | "service_slug">,
): ServiceSlug {
  const raw = (row.service_slug?.trim() || row.service?.trim() || "").toLowerCase();
  if (raw && isServiceSlug(raw)) return raw;
  if (CANONICAL_TO_V2[raw]) return CANONICAL_TO_V2[raw];
  const dashed = raw.replace(/_/g, "-");
  if (dashed && isServiceSlug(dashed)) return dashed;
  if (LABEL_TO_SLUG[raw]) return LABEL_TO_SLUG[raw];
  // Fuzzy label match (e.g. "Regular Cleaning")
  for (const [label, slug] of Object.entries(LABEL_TO_SLUG)) {
    if (raw.includes(label) || label.includes(raw)) return slug;
  }
  return "regular-cleaning";
}

/**
 * Maps a persisted booking row into booking form fields.
 * Clears schedule, cleaner selection, and pricing so the customer picks a new slot.
 */
export function bookingFormPatchFromBookingRow(
  row: CustomerBookingRow,
  serviceSlug: ServiceSlug,
  cleanerMode?: CleanerMode,
): BookingFormData {
  const mode = cleanerMode ?? defaultCleanerMode(serviceSlug);
  const defaults = defaultBookingFormData(serviceSlug);
  const suburb = row.suburb?.trim() || "";
  const address = row.location?.trim() || "";
  const bookingType =
    row.booking_type === "recurring" ? ("recurring" as const) : defaults.bookingType;

  return {
    ...defaults,
    serviceSlug,
    cleanerMode: mode,
    serviceDetails: serviceDetailsFromRow(row.service_details),
    address,
    suburb,
    accessInstructions: row.access_instructions?.trim() ?? "",
    parkingInstructions: row.parking_instructions?.trim() ?? "",
    gateCode: row.gate_code?.trim() ?? "",
    selectedExtras: Array.isArray(row.selected_extras)
      ? row.selected_extras.filter(Boolean)
      : [],
    bookingType,
    date: "",
    time: "",
    alternativeDate: "",
    alternativeTime: "",
    selectedCleanerIds: [],
    selectedCleanerDetails: [],
    serviceAreaLocationId: "",
    serviceAreaCityId: "",
  };
}

/** Deep-link path into the book wizard with rebook prefill. */
export function rebookHrefFromBookingRow(
  row: Pick<CustomerBookingRow, "id" | "service" | "service_slug">,
): string {
  const slug = bookingServiceSlugFromBookingRow(row);
  return `/book/${slug}/details?rebook=${encodeURIComponent(row.id)}`;
}
