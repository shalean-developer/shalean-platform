import { loadBookingStep1FromStorage } from "@/components/booking/useBookingStep1";
import { readLockedBookingFromStorage } from "@/lib/booking/lockedBooking";
import { copyAllowedBookingParams } from "@/lib/booking/bookingUrl";

export const BOOKING_STEP_QUERY = "step";
export const BOOKING_STEP_LS_KEY = "booking_step";
/** Set when homepage draft could not be written (e.g. private mode). Booking UI shows a gentle notice. */
export const BOOKING_NODRAFT_QUERY = "noDraft";

/** Promo / coupon code carried through the funnel (e.g. `?promo=SAVE10`). */
export const BOOKING_PROMO_QUERY = "promo";

/** Safe subset for URL promo codes (matches client promo entry). */
export function sanitizeBookingPromoParam(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (t.length < 2 || t.length > 32) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(t)) return null;
  return t.toUpperCase();
}

export function bookingFlowPromoExtra(promo: string | null | undefined): Record<string, string> | undefined {
  const s = sanitizeBookingPromoParam(promo ?? null);
  if (!s) return undefined;
  return { [BOOKING_PROMO_QUERY]: s };
}

/** Five-step conversion flow (URL `?step=`). */
export const BOOKING_FLOW_STEPS = ["entry", "quote", "details", "when", "checkout"] as const;
export type BookingFlowStep = (typeof BOOKING_FLOW_STEPS)[number];

/** Public URL alias for the schedule step (maps to `when`). */
export const BOOKING_STEP_SCHEDULE_ALIAS = "schedule";

/** Deprecated URL steps — normalized on read. */
const LEGACY_STEP_ALIASES: Record<string, BookingFlowStep> = {
  service: "entry",
  who: "checkout",
};

export function isBookingFlowStep(v: string): v is BookingFlowStep {
  return (BOOKING_FLOW_STEPS as readonly string[]).includes(v);
}

function migrateLegacyStepName(raw: string | null): string | null {
  if (!raw) return null;
  return LEGACY_STEP_ALIASES[raw] ?? raw;
}

/** Normalize `?step=` value; invalid / missing → entry. `schedule` → `when`. */
export function normalizeBookingStepParam(raw: string | null): BookingFlowStep {
  const migrated = migrateLegacyStepName(raw);
  if (migrated === BOOKING_STEP_SCHEDULE_ALIAS) return "when";
  if (migrated && isBookingFlowStep(migrated)) return migrated;
  return "entry";
}

function hasValidLocation(s1: NonNullable<ReturnType<typeof loadBookingStep1FromStorage>>): boolean {
  return s1.location.trim().length >= 3;
}

/** Step 1 complete: location + property type (conversion funnel). */
function hasValidEntry(s1: NonNullable<ReturnType<typeof loadBookingStep1FromStorage>>): boolean {
  return hasValidLocation(s1) && s1.propertyType !== null;
}

/**
 * If the user cannot be on `step` yet, returns the step to redirect to; otherwise null.
 * Client-only (reads localStorage).
 */
export function getBookingStepGateRedirect(step: BookingFlowStep): BookingFlowStep | null {
  if (typeof window === "undefined") return null;

  const s1 = loadBookingStep1FromStorage();
  const locked = readLockedBookingFromStorage();

  if (step === "entry") return null;

  if (step === "quote") {
    if (!s1 || !hasValidEntry(s1)) return "entry";
    return null;
  }

  if (step === "details") {
    if (!s1 || !hasValidLocation(s1)) return "entry";
    if (!s1.service) return "quote";
    return null;
  }

  if (step === "when") {
    if (!s1 || !hasValidLocation(s1)) return "entry";
    if (!s1.service) return "quote";
    const okRooms = s1.rooms >= 1 && s1.bathrooms >= 1;
    if (!okRooms) return "details";
    return null;
  }

  if (step === "checkout") {
    if (!s1 || !hasValidLocation(s1)) return "entry";
    if (!s1.service) return "quote";
    if (!locked?.date || !locked?.time) return "when";
    return null;
  }

  return null;
}

export const BOOKING_FLOW_STEP_PATH: Record<BookingFlowStep, string> = {
  entry: "/booking/details",
  quote: "/booking/details",
  details: "/booking/details",
  when: "/booking/schedule",
  checkout: "/booking/payment",
};

/**
 * Map legacy `?step=` values (including aliases) to the path-based checkout route.
 * Used by `/booking` index redirect.
 */
export function legacyFlowStepQueryToCheckoutPath(stepRaw: string | null | undefined): string {
  const s = stepRaw?.trim().toLowerCase() ?? "";
  if (s === "cleaner") return "/booking/cleaner";
  if (s === "payment") return "/booking/payment";
  const normalized = normalizeBookingStepParam(stepRaw ?? null);
  return BOOKING_FLOW_STEP_PATH[normalized];
}

/** Canonical path-based booking URLs (no `?step=`). Extra keys are filtered to allowed booking query params. */
export function bookingFlowHref(step: BookingFlowStep, extra?: Record<string, string>): string {
  const path = BOOKING_FLOW_STEP_PATH[step];
  const merged = new URLSearchParams();
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) merged.set(k, v);
    }
  }
  const allowed = copyAllowedBookingParams(merged);
  const q = allowed.toString();
  return q ? `${path}?${q}` : path;
}
