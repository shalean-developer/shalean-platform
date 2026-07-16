/**
 * Governed notification retry contract (Princess PR E).
 *
 * Applies to email / push / SMS / WhatsApp workers that schedule retries.
 * Authorization failures, malformed payloads, and invalid recipients must not
 * retry indefinitely — classify as permanent and dead-letter.
 */

export const NOTIFICATION_RETRY_MAX_ATTEMPTS = 5;

/** Base delay (ms) for attempt 1; doubles each subsequent attempt. */
export const NOTIFICATION_RETRY_BASE_DELAY_MS = 60_000;

/** Cap so backlog drains without multi-day stalls. */
export const NOTIFICATION_RETRY_MAX_DELAY_MS = 60 * 60_000;

export type NotificationFailureClass =
  | "transient"
  | "permanent"
  | "permanent_config"
  | "permanent_validation"
  | "invalid_recipient"
  | "authorization";

export type RetryDecision =
  | {
      action: "retry";
      attempt: number;
      nextAttemptAt: string;
      delayMs: number;
      failureClass: NotificationFailureClass;
    }
  | {
      action: "dead_letter";
      attempt: number;
      failureClass: NotificationFailureClass;
      reason: string;
    };

/**
 * Exponential backoff with ±10% jitter.
 * `attemptAfterFailure` is 1-based (first failure → attempt 1).
 */
export function notificationRetryDelayMs(
  attemptAfterFailure: number,
  opts?: { baseMs?: number; maxMs?: number; random?: () => number },
): number {
  const base = opts?.baseMs ?? NOTIFICATION_RETRY_BASE_DELAY_MS;
  const max = opts?.maxMs ?? NOTIFICATION_RETRY_MAX_DELAY_MS;
  const rnd = opts?.random ?? Math.random;
  const a = Math.max(1, Math.floor(attemptAfterFailure));
  const raw = base * 2 ** (a - 1);
  const jitter = 0.9 + rnd() * 0.2;
  return Math.min(max, Math.round(raw * jitter));
}

export function isRetryableFailureClass(c: NotificationFailureClass): boolean {
  return c === "transient";
}

/**
 * Decide retry vs terminal dead-letter for a delivery attempt that just failed.
 * `priorAttempts` = attempts already recorded before this failure (0 on first try).
 */
export function decideNotificationRetry(params: {
  priorAttempts: number;
  failureClass: NotificationFailureClass;
  maxAttempts?: number;
  nowMs?: number;
  random?: () => number;
}): RetryDecision {
  const max = params.maxAttempts ?? NOTIFICATION_RETRY_MAX_ATTEMPTS;
  const attempt = Math.max(0, Math.floor(params.priorAttempts)) + 1;
  const now = params.nowMs ?? Date.now();

  if (!isRetryableFailureClass(params.failureClass)) {
    return {
      action: "dead_letter",
      attempt,
      failureClass: params.failureClass,
      reason: `non_retryable:${params.failureClass}`,
    };
  }

  if (attempt >= max) {
    return {
      action: "dead_letter",
      attempt,
      failureClass: params.failureClass,
      reason: `max_attempts:${max}`,
    };
  }

  const delayMs = notificationRetryDelayMs(attempt, { random: params.random });
  return {
    action: "retry",
    attempt,
    delayMs,
    nextAttemptAt: new Date(now + delayMs).toISOString(),
    failureClass: params.failureClass,
  };
}

/** Mask recipient for operator UIs (keep last 4 of email local-part / phone digits). */
export function maskNotificationRecipient(recipient: string): string {
  const r = recipient.trim();
  if (!r) return "***";
  if (r.includes("@")) {
    const [local, domain] = r.split("@");
    if (!domain) return "***";
    const keep = local.slice(0, Math.min(2, local.length));
    return `${keep}***@${domain}`;
  }
  if (r.startsWith("ExponentPushToken[")) {
    return `ExponentPushToken[…${r.slice(-6)}`;
  }
  const digits = r.replace(/\D/g, "");
  if (digits.length >= 4) return `***${digits.slice(-4)}`;
  return "***";
}
