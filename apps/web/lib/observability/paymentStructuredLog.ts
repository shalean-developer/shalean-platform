export type PaymentStructuredEvent =
  | "payment_initialize"
  | "payment_finalize"
  | "payment_mismatch"
  | "finalize_rejected_no_pending_row"
  | "notification_sent"
  | "notification_skipped"
  | "lifecycle_failed"
  | "payment_precheck"
  | "payment_finalize_signal"
  | "r0_settlement_started"
  | "r0_settlement_succeeded"
  | "r0_settlement_failed"
  | "r0_ledger_booking_mismatch"
  | "pending_collected_cash_anomaly"
  | "admin_paid_booking_price_change";

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
