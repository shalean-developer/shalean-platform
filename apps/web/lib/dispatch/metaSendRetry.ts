function jitterMs(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

/** Exponential backoff (ms) for Meta send retries: 1s → 2s → 5s (+ jitter 0–500ms). */
export function metaGraphSendRetryDelayMs(attemptIndex: number): number {
  const base = attemptIndex <= 0 ? 1000 : attemptIndex === 1 ? 2000 : 5000;
  return base + jitterMs(500);
}
