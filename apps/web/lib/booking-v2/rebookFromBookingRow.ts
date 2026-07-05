import type { BookingRow } from "@/lib/dashboard/types";
import { bookingServiceSlugFromBookingRow } from "@/lib/booking-v2/bookingV2ServiceSlug";
import type { ServiceSlug, CleanerMode } from "@/src/features/booking-v2/config/serviceConfig";
import {
  defaultBookingFormData,
  type BookingV2FormData,
} from "@/src/features/booking-v2/types";

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

/** Builds a v2 booking URL that pre-fills from a prior booking (fresh date/time). */
export function rebookBookUrlFromBookingRow(
  row: Pick<BookingRow, "id" | "service" | "service_slug">,
): string {
  const slug = bookingServiceSlugFromBookingRow(row);
  return `/book/${slug}?rebook=${encodeURIComponent(row.id)}&step=2`;
}

/**
 * Maps a persisted booking row into booking-v2 form fields.
 * Clears schedule, cleaner selection, and pricing so the customer picks a new slot.
 */
export function bookingV2FormPatchFromBookingRow(
  row: BookingRow,
  serviceSlug: ServiceSlug,
  cleanerMode: CleanerMode,
): BookingV2FormData {
  const defaults = defaultBookingFormData(serviceSlug, cleanerMode);
  const suburb = row.suburb?.trim() || "";
  const address = row.location?.trim() || "";
  const bookingType =
    row.booking_type === "recurring" ? ("recurring" as const) : defaults.bookingType;

  return {
    ...defaults,
    serviceSlug,
    serviceDetails: serviceDetailsFromRow(row.service_details),
    address,
    suburb,
    accessInstructions: row.access_instructions?.trim() ?? "",
    parkingInstructions: row.parking_instructions?.trim() ?? "",
    gateCode: row.gate_code?.trim() ?? "",
    selectedExtras: Array.isArray(row.selected_extras) ? row.selected_extras.filter(Boolean) : [],
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
