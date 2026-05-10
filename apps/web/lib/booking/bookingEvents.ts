/**
 * Canonical booking domain events (contract only).
 * No persistence, dispatch, or notification side effects in this module.
 */

export type CanonicalBookingEventType =
  | "booking.created"
  | "booking.payment_pending"
  | "booking.payment_succeeded"
  | "booking.payment_failed"
  | "booking.assigned"
  | "booking.cleaner_offered"
  | "booking.cleaner_accepted"
  | "booking.cleaner_rejected"
  | "booking.cleaner_on_the_way"
  | "booking.cleaner_arrived"
  | "booking.started"
  | "booking.completed"
  | "booking.cancelled"
  | "booking.rescheduled"
  | "booking.refunded"
  | "booking.recurring_generated"
  | "booking.invoice_created"
  | "booking.invoice_paid"
  | "booking.payout_ready"
  | "booking.payout_paid";

export type CanonicalBookingEventActor = "system" | "admin" | "customer" | "cleaner" | "paystack" | "cron";

export type CanonicalBookingEvent = {
  id?: string;
  type: CanonicalBookingEventType;
  bookingId: string;
  actor: CanonicalBookingEventActor;
  occurredAt: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};

export type BuildBookingEventArgs = {
  type: CanonicalBookingEventType;
  bookingId: string;
  actor: CanonicalBookingEventActor;
  metadata?: Record<string, unknown>;
  /**
   * Third-party reference or coarse bucket for stable idempotency across retries
   * (e.g. Paystack reference). Colons are stripped from the key segment.
   */
  externalRef?: string | null;
};

/** Keep idempotency keys safe for logs/headers: no raw colons inside segments after join. */
function sanitizeIdempotencySegment(raw: string): string {
  const t = raw.trim();
  if (!t) return "none";
  return t.replace(/:/g, "_").slice(0, 240);
}

/**
 * Builds a {@link CanonicalBookingEvent} with deterministic `idempotencyKey`:
 * `${type}:${bookingId}:${actor}:${externalRef|none}`
 */
export function buildBookingEvent(args: BuildBookingEventArgs): CanonicalBookingEvent {
  const occurredAt = new Date().toISOString();
  const refSeg = sanitizeIdempotencySegment(args.externalRef ?? "");
  const idempotencyKey = `${args.type}:${args.bookingId}:${args.actor}:${refSeg}`;
  return {
    type: args.type,
    bookingId: args.bookingId,
    actor: args.actor,
    occurredAt,
    idempotencyKey,
    metadata: args.metadata,
  };
}
