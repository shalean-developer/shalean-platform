/**
 * Rollout flag: strict calendar + cleaner_locations for eligibility.
 * When false, missing calendar rows for a date still count as "all day" available (legacy).
 */
export function useStrictAvailability(): boolean {
  return process.env.USE_STRICT_AVAILABILITY === "true";
}
