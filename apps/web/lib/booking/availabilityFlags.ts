/**
 * Rollout flag: strict calendar + cleaner_locations for eligibility.
 * When false, missing calendar rows for a date still count as "all day" available (legacy).
 */
export function isStrictAvailabilityEnabled(): boolean {
  return process.env.USE_STRICT_AVAILABILITY === "true";
}

/**
 * Phase A soft fulfillment: allow ops_assignment / area_review instead of hard-blocking
 * when no cleaner is instantly eligible. Default ON so conversion improves; set
 * `BOOKING_SOFT_FULFILLMENT=false` to restore legacy 409 / empty-slot behaviour.
 */
export function isBookingSoftFulfillmentEnabled(): boolean {
  return process.env.BOOKING_SOFT_FULFILLMENT !== "false";
}

/**
 * Phase 2E-D rollout flag: public cleaner availability may soft-filter solo cleaners
 * whose scheduled minutes would exceed the future 8h/day policy after the requested booking.
 * Default OFF; admin and dispatch call sites must opt in explicitly if/when policy changes.
 */
export function maxCleanerDailyWorkloadEnforcePublic(): boolean {
  return process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_PUBLIC === "true";
}

/**
 * Phase 2E-E rollout flag: admin assignment may enforce the future 8h/day solo
 * workload policy for normal (non-force) assignments. Default OFF; force remains
 * an explicit admin override and team roster-hour caps are not enforced here.
 */
export function maxCleanerDailyWorkloadEnforceAdmin(): boolean {
  return process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_ADMIN === "true";
}
