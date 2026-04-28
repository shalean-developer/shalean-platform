/** Max parallel dispatch offers (normal surge). */
export const MAX_PARALLEL_OFFERS = 3;
/** Upper cap when demand / urgency pushes wider fan-out. */
export const MAX_PARALLEL_OFFERS_PEAK = 5;

/**
 * Staggered Tier A/B/C visibility + deferred SMS for later tiers.
 * Set `DISPATCH_TIERED_WINDOWS=0` to restore legacy sequential parallel waves only.
 */
export function dispatchTieredWindowsEnabled(): boolean {
  return process.env.DISPATCH_TIERED_WINDOWS !== "0";
}
