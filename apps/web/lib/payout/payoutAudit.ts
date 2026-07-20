import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";

export type PayoutAuditEventType =
  | "payout_generated"
  | "payout_approved"
  | "payout_rejected"
  | "payout_amount_adjusted"
  | "visit_earnings_adjusted"
  | "payout_pay_requested"
  | "payout_transfer_enqueued"
  | "payout_transfer_submitted"
  | "payout_transfer_succeeded"
  | "payout_transfer_failed"
  | "payout_transfer_needs_reconcile"
  | "payout_webhook_received"
  | "payout_retry"
  | "payout_manual_mark_paid"
  | "ledger_disburse_requested";

/**
 * Append-only payout audit. Never throws — financial paths must not fail on logging.
 */
export async function logPayoutAuditEvent(
  admin: SupabaseClient,
  params: {
    eventType: PayoutAuditEventType;
    actorUserId?: string | null;
    actorEmail?: string | null;
    payoutId?: string | null;
    disbursementId?: string | null;
    bookingIds?: string[] | null;
    amountCents?: number | null;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    reference?: string | null;
    ip?: string | null;
    context?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    const { error } = await admin.from("payout_audit_events").insert({
      event_type: params.eventType,
      actor_user_id: params.actorUserId ?? null,
      actor_email: params.actorEmail ?? null,
      payout_id: params.payoutId ?? null,
      disbursement_id: params.disbursementId ?? null,
      booking_ids: params.bookingIds?.length ? params.bookingIds : null,
      amount_cents: params.amountCents ?? null,
      old_values: params.oldValues ?? null,
      new_values: params.newValues ?? null,
      reference: params.reference ?? null,
      ip: params.ip ?? null,
      context: params.context ?? null,
    });
    if (error) {
      void logSystemEvent({
        level: "warn",
        source: "payout_audit",
        message: "payout_audit_events insert failed",
        context: { eventType: params.eventType, error: error.message },
      });
    }
  } catch (e) {
    void logSystemEvent({
      level: "warn",
      source: "payout_audit",
      message: "payout_audit_events insert threw",
      context: { eventType: params.eventType, error: e instanceof Error ? e.message : String(e) },
    });
  }
}
