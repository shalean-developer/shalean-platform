/**
 * Spacing between user-selected recovery waves (after each wave completes).
 * 1st wave runs immediately when eligible; after wave N completes, wait before wave N+1.
 */
export function backoffMsAfterUserSelectedRecoveryWave(attemptCountAfterWave: number): number {
  if (attemptCountAfterWave <= 0) return 0;
  if (attemptCountAfterWave === 1) return 30_000;
  if (attemptCountAfterWave === 2) return 90_000;
  return 180_000;
}

/** ~±15% jitter (within ±10–20%) so many bookings do not wake in lockstep. */
export function applyDispatchBackoffJitter(baseMs: number): number {
  if (!Number.isFinite(baseMs) || baseMs <= 0) return baseMs;
  return Math.round(baseMs * (0.85 + Math.random() * 0.3));
}
