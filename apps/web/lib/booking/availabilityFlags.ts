/**
 * Rollout flag: strict calendar + cleaner_locations for eligibility.
 * When false, missing calendar rows for a date still count as "all day" available (legacy).
 */
export function useStrictAvailability(): boolean {
  return process.env.USE_STRICT_AVAILABILITY === "true";
}

/**
 * Phase 2E-D rollout flag: public cleaner availability may soft-filter solo cleaners
 * whose scheduled minutes would exceed the future 8h/day policy after the requested booking.
 * Default OFF; admin and dispatch call sites must opt in explicitly if/when policy changes.
 */
export function maxCleanerDailyWorkloadEnforcePublic(): boolean {
  return process.env.MAX_CLEANER_DAILY_WORKLOAD_ENFORCE_PUBLIC === "true";
}
