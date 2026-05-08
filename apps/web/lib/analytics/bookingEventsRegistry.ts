/**
 * Coarse funnel-step telemetry (`booking_events`). Semantic booking intents live in `user_events`;
 * see {@link CANONICAL_BOOKING_SEMANTIC_ORDER} in `@/lib/analytics/bookingAnalyticsTruth`.
 *
 * Labels stored in `booking_events.step` — must match client {@link bookingRouteToFunnelStep}.
 */
export const BOOKING_EVENTS_STEPS = ["entry", "quote", "extras", "datetime", "details", "payment"] as const;
export type BookingEventsStep = (typeof BOOKING_EVENTS_STEPS)[number];
export const BOOKING_EVENTS_STEPS_SET: ReadonlySet<string> = new Set(BOOKING_EVENTS_STEPS);

/** Low-level funnel interaction row types in `booking_events.event_type`. */
export const BOOKING_EVENTS_ROW_TYPES = ["view", "next", "back", "error", "exit"] as const;
export type BookingEventsRowType = (typeof BOOKING_EVENTS_ROW_TYPES)[number];
export const BOOKING_EVENTS_ROW_TYPES_SET: ReadonlySet<string> = new Set(BOOKING_EVENTS_ROW_TYPES);

/** Use in client `trackBookingFunnelEvent` calls instead of raw strings. */
export const BOOKING_FUNNEL_ROW = {
  VIEW: "view",
  NEXT: "next",
  BACK: "back",
  ERROR: "error",
  EXIT: "exit",
} as const satisfies Record<string, BookingEventsRowType>;

export type BookingFunnelRowUi = (typeof BOOKING_FUNNEL_ROW)[keyof typeof BOOKING_FUNNEL_ROW];
