import {
  deriveBookingOperationalPhase,
  isAuthoritativeBookingCompleted,
  type BookingOperationalPhase,
  type PhaseRow,
} from "@/lib/booking/deriveBookingOperationalPhase";

export type CustomerTrackPoint = {
  lat: number;
  lng: number;
  created_at: string | null;
};

export type CustomerBookingTrackDto = {
  bookingId: string;
  locationLabel: string | null;
  service: string | null;
  cleanerName: string | null;
  phase: BookingOperationalPhase;
  /** True when live map / point may be shown (travelling or active, not completed). */
  trackable: boolean;
  /**
   * Latest cleaner track point — **only** present when `trackable` is true.
   * Never returned for non-owners (ownership is enforced before this DTO is built).
   */
  point: CustomerTrackPoint | null;
  message: string;
};

export type CustomerTrackBookingFields = PhaseRow & {
  id?: string | null;
  location?: string | null;
  service?: string | null;
  display_cleaner_name?: string | null;
  payout_owner_cleaner_name?: string | null;
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Live tracking is only available while the cleaner is on the way or on the job. */
export function isCustomerBookingTrackable(row: PhaseRow): boolean {
  if (isAuthoritativeBookingCompleted(row)) return false;
  const phase = deriveBookingOperationalPhase(row);
  return phase === "travelling" || phase === "active";
}

/**
 * Parse a raw track-point row. Returns null if coordinates are invalid.
 * Callers must still gate with {@link isCustomerBookingTrackable} before exposing to clients.
 */
export function parseCustomerTrackPoint(raw: unknown): CustomerTrackPoint | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const lat = num(r.lat);
  const lng = num(r.lng);
  if (lat == null || lng == null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    lat,
    lng,
    created_at: typeof r.created_at === "string" ? r.created_at : null,
  };
}

/**
 * Build the customer track DTO. Location privacy: `point` is stripped unless trackable.
 */
export function buildCustomerBookingTrackDto(
  booking: CustomerTrackBookingFields,
  rawPoint: unknown,
): CustomerBookingTrackDto {
  const bookingId = String(booking.id ?? "").trim();
  const phase = deriveBookingOperationalPhase(booking);
  const trackable = isCustomerBookingTrackable(booking);
  const parsed = parseCustomerTrackPoint(rawPoint);
  const point = trackable ? parsed : null;

  let message: string;
  if (!trackable) {
    message = "Live map appears when your cleaner is on the way or the job is in progress.";
  } else if (!point) {
    message = "Waiting for the cleaner’s location…";
  } else {
    message = "Cleaner location updates while they are en route or on the job.";
  }

  const cleanerName =
    (typeof booking.display_cleaner_name === "string" && booking.display_cleaner_name.trim()) ||
    (typeof booking.payout_owner_cleaner_name === "string" && booking.payout_owner_cleaner_name.trim()) ||
    null;

  return {
    bookingId,
    locationLabel: typeof booking.location === "string" ? booking.location.trim() || null : null,
    service: typeof booking.service === "string" ? booking.service.trim() || null : null,
    cleanerName,
    phase,
    trackable,
    point,
    message,
  };
}
