import "server-only";

/**
 * Raw Paystack metadata / booking_snapshot-style dumps belong behind an explicit flag (including local dev).
 *
 * - `BOOKING_PAYSTACK_DEBUG_LOGS=1` — umbrella for verbose Paystack finalize/init tracing.
 * - `TRACE_PAYSTACK_METADATA=1` — legacy alias (metadata / snapshot parsing).
 * - `TRACE_PAYSTACK_FINALIZE=1` — legacy alias (DB finalize steps + upsert tracing).
 */
export function bookingPaystackMetadataDebugEnabled(): boolean {
  return (
    process.env.BOOKING_PAYSTACK_DEBUG_LOGS === "1" ||
    process.env.TRACE_PAYSTACK_METADATA === "1"
  );
}

export function bookingPaystackFinalizeTraceEnabled(): boolean {
  return (
    process.env.BOOKING_PAYSTACK_DEBUG_LOGS === "1" ||
    process.env.TRACE_PAYSTACK_FINALIZE === "1"
  );
}
