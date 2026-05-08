/**
 * **Analytics truth model** (enforced in code via imports — keep aligned with warehouse SQL).
 *
 * ## Semantic pipe (`public.user_events`)
 * High-grain product intents: `booking_step_details_started`, `booking_service_selected`,
 * `booking_payment_started`, `booking_paystack_opened`, `booking_completed`, `payment_completed`, …
 * Emitted via {@link trackBookingAnalyticsEvent} → {@link trackGrowthEvent}.
 * Payloads carry `analytics_session_id` / `booking_session_id` (same id post-convergence).
 *
 * ## Funnel step pipe (`public.booking_events`)
 * Coarse navigation: `step` ∈ registry steps × `event_type` ∈ view | next | back | error | exit.
 * Emitted via {@link trackBookingFunnelEvent} → `/api/analytics/booking-event`.
 * Used for drop-offs / step dwell — **not** a duplicate of semantic events.
 *
 * ## Ordering target (happy path)
 * details_started → service_selected → addon_selected → continue_schedule → date_selected →
 * time_selected → cleaner_selected → payment_started → paystack_opened → (payment_completed) → booking_completed
 *
 * ## Attribution
 * Persisted on Paystack metadata (`analytics_session_id`, `payment_mode`, `attribution_source`) and
 * Growth payloads so retries / `/booking/payment` reopen stay correlated when browsers reuse storage.
 */

/** Semantic booking funnel sequence for QA / dashboards (names match {@link ANALYTICS_EVENTS}). */
export const CANONICAL_BOOKING_SEMANTIC_ORDER = [
  "booking_step_details_started",
  "booking_service_selected",
  "booking_addon_selected",
  "booking_continue_schedule",
  "booking_date_selected",
  "booking_time_selected",
  "booking_cleaner_selected",
  "booking_payment_started",
  "booking_paystack_opened",
  "payment_completed",
  "booking_completed",
] as const;
