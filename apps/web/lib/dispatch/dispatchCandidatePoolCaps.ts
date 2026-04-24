/**
 * Tighten then widen the scored pool by recovery depth (dispatch_attempt_count on the booking row).
 * Wave 0 = first auto-dispatch; each user-selected recovery increments the counter before ensure.
 */
export function softDispatchPoolCapsFromAttemptCount(dispatchAttemptCount: number): {
  maxCandidates: number;
  maxSoftOffers: number;
} {
  const n = Number.isFinite(dispatchAttemptCount) ? Math.max(0, Math.floor(dispatchAttemptCount)) : 0;
  if (n <= 0) return { maxCandidates: 3, maxSoftOffers: 3 };
  if (n === 1) return { maxCandidates: 5, maxSoftOffers: 5 };
  return { maxCandidates: 8, maxSoftOffers: 8 };
}
