import { parseBookingServiceId } from "@/components/booking/serviceCategories";
import type { BookingCheckoutState } from "@/lib/booking/bookingCheckoutStore";

export const BOOKING_CHECKOUT_SEGMENTS = ["details", "schedule", "cleaner", "payment"] as const;

export type BookingCheckoutSegment = (typeof BOOKING_CHECKOUT_SEGMENTS)[number];

export const BOOKING_SEGMENT_INDEX: Record<BookingCheckoutSegment, number> = {
  details: 0,
  schedule: 1,
  cleaner: 2,
  payment: 3,
};

export function isBookingCheckoutSegment(s: string | null | undefined): s is BookingCheckoutSegment {
  return s != null && (BOOKING_CHECKOUT_SEGMENTS as readonly string[]).includes(s);
}

export type MaxReachableCheckoutOpts = {
  /** While the pricing catalog is loading, do not down-rank the path (avoids bogus redirects from deep links). */
  catalogLoading?: boolean;
  /** Current path segment index (0–3); used only with `catalogLoading`. */
  currentSegmentIndex?: number;
};

/** Highest segment index allowed (0–3) without skipping required intake. */
export function getMaxReachableCheckoutSegmentIndex(
  state: Pick<BookingCheckoutState, "service" | "bedrooms" | "bathrooms" | "date" | "time" | "location">,
  catalogServiceIds: readonly string[] | undefined,
  opts?: MaxReachableCheckoutOpts,
): number {
  if (opts?.catalogLoading) {
    const i = opts.currentSegmentIndex;
    if (typeof i === "number" && i >= 0 && i <= 3) return i;
  }

  if (!catalogServiceIds?.length) return 0;

  const sid = parseBookingServiceId(state.service);
  const ids = new Set(catalogServiceIds);
  const serviceOk = Boolean(state.service.trim() && sid && ids.has(state.service));
  if (!serviceOk || state.bedrooms < 1 || state.bathrooms < 1) return 0;

  const scheduleOk = Boolean(
    state.date && String(state.date).trim() && state.time && String(state.time).trim() && state.location.trim().length >= 3,
  );
  if (!scheduleOk) return 1;

  return 3;
}

export function checkoutSegmentPath(seg: BookingCheckoutSegment): string {
  return `/booking/${seg}`;
}

export function nextCheckoutSegment(seg: BookingCheckoutSegment): BookingCheckoutSegment | null {
  const i = BOOKING_SEGMENT_INDEX[seg];
  return BOOKING_CHECKOUT_SEGMENTS[i + 1] ?? null;
}

export function prevCheckoutSegment(seg: BookingCheckoutSegment): BookingCheckoutSegment | null {
  const i = BOOKING_SEGMENT_INDEX[seg];
  return BOOKING_CHECKOUT_SEGMENTS[i - 1] ?? null;
}

export function scheduleStepComplete(state: Pick<BookingCheckoutState, "date" | "time" | "location">): boolean {
  return Boolean(
    state.date && String(state.date).trim() && state.time && String(state.time).trim() && state.location.trim().length >= 3,
  );
}
