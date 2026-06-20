/** Machine-readable skip / cancel reasons for lifecycle email jobs (audit + admin filters). */
export const LIFECYCLE_SKIP = {
  appointmentAlreadyPassed: "appointment_already_passed",
  rebookOfferTooOld: "rebook_offer_too_old",
  reviewRequestTooOld: "review_request_too_old",
  bookingCancelled: "booking_cancelled",
  bookingUnpaid: "booking_unpaid",
  bookingNotCompleted: "booking_not_completed",
  noCleanerOrTeamAssigned: "no_cleaner_or_team_assigned",
  customerHasActiveRecurringPlan: "customer_has_active_recurring_plan",
  customerHasFutureBooking: "customer_has_future_booking",
  customerAlreadyRebooked: "customer_already_rebooked",
  customerUnsubscribed: "customer_unsubscribed",
  frequencyLimitReached: "frequency_limit_reached",
  recurringOrFutureBookingCleanup: "customer_has_active_recurring_plan_or_future_booking",
} as const;

export type LifecycleSkipReason = (typeof LIFECYCLE_SKIP)[keyof typeof LIFECYCLE_SKIP];
