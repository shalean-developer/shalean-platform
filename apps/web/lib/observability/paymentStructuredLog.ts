export type PaymentStructuredEvent =
  | "payment_initialize"
  | "payment_finalize"
  | "payment_mismatch"
  | "finalize_rejected_no_pending_row"
  | "notification_sent"
  | "notification_skipped"
  | "lifecycle_failed";

/**
 * Single-line JSON for log drains (Datadog / BigQuery / etc.).
 */
export function logPaymentStructured(event: PaymentStructuredEvent, fields: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      event,
      at: new Date().toISOString(),
      ...fields,
    }),
  );
}
