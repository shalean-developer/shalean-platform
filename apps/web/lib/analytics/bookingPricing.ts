/**
 * Wire to PostHog / Segment / etc. when ready — cohorts: avg extras, revenue per room, upsell lift.
 * Dedupe: booking detail sets `window.__trackedBookingBreakdown[bookingId]` so Strict Mode / remounts do not double-count.
 */
export type BookingPriceBreakdownAnalyticsPayload = {
  bookingId: string;
  serviceBaseZar: number;
  roomsZar: number;
  extrasZar: number;
};

export function trackBookingPriceBreakdownShown(_payload: BookingPriceBreakdownAnalyticsPayload): void {
  // Intentionally empty until an analytics provider is configured.
}
