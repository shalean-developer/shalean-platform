import "server-only";

/**
 * Opt-in server logs for payment → notification tracing.
 * Set `SHALEAN_NOTIFY_BOOKING_DEBUG=1` in `.env.local` or Vercel (never leave on in production unless diagnosing).
 */
export function isNotifyBookingDebug(): boolean {
  const v = process.env.SHALEAN_NOTIFY_BOOKING_DEBUG?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Structured line for grep; avoids PII in default payloads — pass booleans / ids / error codes only. */
export function notifyBookingDebug(tag: string, data: Record<string, unknown>): void {
  if (!isNotifyBookingDebug()) return;
  console.info(`[notify-booking-debug] ${tag}`, data);
}
