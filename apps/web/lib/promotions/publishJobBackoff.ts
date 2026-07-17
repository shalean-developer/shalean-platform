/**
 * MKT-001B.2 — Deterministic publish-job backoff helpers.
 *
 * delay = max(retryAfterMs, min(cap, base * 2^attempts * jitter))
 * Jitter is injectable so unit tests can assert exact bounds.
 */

export const PUBLISH_JOB_BACKOFF_BASE_MS = 60_000;
export const PUBLISH_JOB_BACKOFF_CAP_MS = 60 * 60 * 1000; // 60 minutes
export const PUBLISH_JOB_DEFAULT_MAX_ATTEMPTS = 5;

export type BackoffArgs = {
  /** 1-based attempts after failure (first failure → 1). */
  attemptsAfterFailure: number;
  /** Provider taxonomy hint; may raise the floor. */
  retryAfterMs?: number | null;
  baseMs?: number;
  capMs?: number;
  /** Deterministic [0,1) random; default Math.random. */
  random?: () => number;
};

/**
 * Compute next delay in ms. Jitter range is ±10% (factor 0.9–1.1).
 */
export function computePublishJobBackoffMs(args: BackoffArgs): number {
  const attempts = Math.max(1, Math.floor(args.attemptsAfterFailure));
  const base =
    typeof args.baseMs === "number" && Number.isFinite(args.baseMs) && args.baseMs > 0
      ? args.baseMs
      : PUBLISH_JOB_BACKOFF_BASE_MS;
  const cap =
    typeof args.capMs === "number" && Number.isFinite(args.capMs) && args.capMs > 0
      ? args.capMs
      : PUBLISH_JOB_BACKOFF_CAP_MS;
  const rnd = typeof args.random === "function" ? args.random() : Math.random();
  const unit = Number.isFinite(rnd) ? Math.min(1, Math.max(0, rnd)) : 0.5;
  const jitter = 0.9 + unit * 0.2;
  const exponential = Math.min(cap, base * 2 ** attempts * jitter);
  const floor =
    typeof args.retryAfterMs === "number" && Number.isFinite(args.retryAfterMs) && args.retryAfterMs > 0
      ? args.retryAfterMs
      : 0;
  return Math.round(Math.min(cap, Math.max(floor, exponential)));
}

export function nextAttemptAtIso(delayMs: number, nowMs: number = Date.now()): string {
  const safe = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : PUBLISH_JOB_BACKOFF_BASE_MS;
  return new Date(nowMs + safe).toISOString();
}
