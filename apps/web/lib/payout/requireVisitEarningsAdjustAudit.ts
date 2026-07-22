import type { SupabaseClient } from "@supabase/supabase-js";
import { logPayoutAuditEvent } from "@/lib/payout/payoutAudit";

/**
 * Fail-closed durable audit for visit earnings mutations.
 * Returns an error when `payout_audit_events` insert fails so callers do not report success.
 */
export async function requireVisitEarningsAdjustAudit(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    cleanerId: string | null;
    payoutId: string | null;
    adminUserId: string;
    mode: "solo_owner" | "per_cleaner";
    previousTotalCents: number | null;
    newPayoutCents: number;
    newBonusCents: number;
    newTotalCents: number;
    adjustmentNote?: string | null;
    batchTotalCents?: number | null;
    correlationId?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  const bookingId = String(params.bookingId ?? "").trim();
  const adminUserId = String(params.adminUserId ?? "").trim();
  if (!bookingId || !adminUserId) {
    return { ok: false, error: "Missing audit identity.", code: "audit_invalid_params" };
  }

  const { error } = await admin.from("payout_audit_events").insert({
    event_type: "visit_earnings_adjusted",
    actor_user_id: adminUserId,
    payout_id: params.payoutId,
    booking_ids: [bookingId],
    amount_cents: params.newTotalCents,
    old_values: {
      total_cents: params.previousTotalCents,
    },
    new_values: {
      payout_cents: params.newPayoutCents,
      bonus_cents: params.newBonusCents,
      total_cents: params.newTotalCents,
      cleaner_id: params.cleanerId,
      mode: params.mode,
    },
    context: {
      cleaner_id: params.cleanerId,
      adjustment_note: params.adjustmentNote?.trim() || null,
      batch_total_cents: params.batchTotalCents ?? null,
      correlation_id: params.correlationId ?? null,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
    },
  });

  if (error) {
    // Best-effort secondary log for operators; primary path still fails closed.
    void logPayoutAuditEvent(admin, {
      eventType: "payout_amount_adjusted",
      actorUserId: adminUserId,
      payoutId: params.payoutId,
      bookingIds: [bookingId],
      amountCents: params.newTotalCents,
      context: {
        visit_earnings_audit_failed: true,
        error: error.message,
        cleaner_id: params.cleanerId,
      },
    });
    return { ok: false, error: `Audit persistence failed: ${error.message}`, code: "audit_persist_failed" };
  }

  return { ok: true };
}
