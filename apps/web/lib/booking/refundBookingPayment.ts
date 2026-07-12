import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSystemEvent } from "@/lib/logging/systemLog";
import { refundPaystackTransaction } from "@/lib/paystack/refundPaystackTransaction";
import { maybeProcessReferralClawbackOnBookingChange } from "@/lib/referrals/clawback";

export type RefundBookingPaymentResult =
  | {
      ok: true;
      paystackRefunded: boolean;
      recordedOnly: boolean;
      alreadyReversedOnPaystack: boolean;
      refundReference: string | null;
      refundStatus: "full" | "partial";
      clawbackTriggered: boolean;
    }
  | { ok: false; error: string };

type RefundParams = {
  bookingId: string;
  note?: string;
  /** Skip Paystack API — use when refund was done in the Paystack dashboard. */
  recordOnly?: boolean;
  /** Optional Paystack refund id/reference from the dashboard. */
  refundReference?: string;
  /** Partial refund amount in cents. Omit for full refund of collected amount. */
  amountCents?: number;
};

function resolvePaidCents(row: {
  amount_paid_cents?: number | null;
  total_paid_cents?: number | null;
  total_paid_zar?: number | null;
}): number {
  const ap = Number(row.amount_paid_cents ?? row.total_paid_cents);
  if (Number.isFinite(ap) && ap > 0) return Math.round(ap);
  const zar = Number(row.total_paid_zar);
  if (Number.isFinite(zar) && zar > 0) return Math.round(zar * 100);
  return 0;
}

/**
 * Admin booking refund (Phase 2). Mirrors invoice/sales-document refund shape.
 * Sets refund_status / refunded_at, preserves gateway audit, triggers referral clawback,
 * and relies on bookingEarningsIntegrity to block payout recompute.
 */
export async function refundBookingPayment(
  admin: SupabaseClient,
  params: RefundParams,
): Promise<RefundBookingPaymentResult> {
  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, status, payment_status, paystack_reference, amount_paid_cents, total_paid_cents, total_paid_zar, refunded_at, refund_status, monthly_invoice_id, user_id, customer_email",
    )
    .eq("id", params.bookingId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "booking_not_found" };

  const row = data as {
    id: string;
    status: string | null;
    payment_status: string | null;
    paystack_reference: string | null;
    amount_paid_cents: number | null;
    total_paid_cents: number | null;
    total_paid_zar: number | null;
    refunded_at: string | null;
    refund_status: string | null;
    monthly_invoice_id: string | null;
    user_id: string | null;
    customer_email: string | null;
  };

  if (row.monthly_invoice_id) {
    return { ok: false, error: "monthly_child_use_invoice_refund" };
  }

  const existingRefund = String(row.refund_status ?? "").toLowerCase();
  if (
    row.refunded_at ||
    ["refunded", "full", "chargeback", "reversed"].includes(existingRefund)
  ) {
    return { ok: false, error: "already_refunded" };
  }

  const paidCents = resolvePaidCents(row);
  if (paidCents <= 0) return { ok: false, error: "nothing_to_refund" };

  const paymentStatus = String(row.payment_status ?? "").toLowerCase();
  if (!["success", "paid", "complete", "completed"].includes(paymentStatus) && paidCents <= 0) {
    return { ok: false, error: "not_paid" };
  }

  const requested =
    params.amountCents != null && Number.isFinite(params.amountCents)
      ? Math.max(0, Math.round(params.amountCents))
      : paidCents;
  if (requested <= 0) return { ok: false, error: "invalid_amount" };
  if (requested > paidCents) return { ok: false, error: "amount_exceeds_paid" };

  const refundStatus: "full" | "partial" = requested >= paidCents ? "full" : "partial";
  const chargeRef = row.paystack_reference?.trim() || null;

  let paystackRefunded = false;
  let alreadyReversedOnPaystack = false;
  let refundReference = params.refundReference?.trim() || null;
  const recordOnly = params.recordOnly === true;

  if (!recordOnly && chargeRef) {
    const refundResult = await refundPaystackTransaction({
      transactionReference: chargeRef,
      amountCents: refundStatus === "partial" ? requested : undefined,
      merchantNote: params.note,
    });
    if (!refundResult.ok) {
      return { ok: false, error: refundResult.error };
    }
    paystackRefunded = true;
    alreadyReversedOnPaystack = refundResult.alreadyReversed === true;
    refundReference = refundResult.refundReference || refundReference || chargeRef;
  } else if (!chargeRef && !recordOnly) {
    return { ok: false, error: "missing_paystack_reference" };
  }

  const nowIso = new Date().toISOString();
  const remainingCents = Math.max(0, paidCents - requested);
  const patch: Record<string, unknown> = {
    refunded_at: nowIso,
    refund_status: refundStatus === "full" ? "full" : "partial",
  };

  if (refundStatus === "full") {
    // Keep historical paid columns for audit; earnings integrity keys off refund_status.
    patch.payment_status = "refunded";
  } else {
    patch.amount_paid_cents = remainingCents;
    patch.total_paid_cents = remainingCents;
    patch.total_paid_zar = Math.round(remainingCents) / 100;
  }

  const { error: upErr } = await admin.from("bookings").update(patch).eq("id", row.id);
  if (upErr) return { ok: false, error: upErr.message };

  await maybeProcessReferralClawbackOnBookingChange({
    admin,
    bookingId: row.id,
    newStatus: row.status,
    refundedAt: nowIso,
    refundStatus: String(patch.refund_status),
  });

  await logSystemEvent({
    level: "info",
    source: "booking/refund",
    message: "booking.refund.recorded",
    context: {
      bookingId: row.id,
      refundStatus,
      requestedCents: requested,
      paystackRefunded,
      recordedOnly: recordOnly,
      alreadyReversedOnPaystack,
      refundReference,
      note: params.note?.slice(0, 200) ?? null,
    },
  });

  return {
    ok: true,
    paystackRefunded,
    recordedOnly: recordOnly,
    alreadyReversedOnPaystack,
    refundReference,
    refundStatus,
    clawbackTriggered: true,
  };
}

/**
 * Record a Paystack dispute/chargeback against a booking without calling refund API.
 */
export async function markBookingChargeback(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    paystackReference?: string | null;
    note?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("bookings")
    .select("id, status, refunded_at, refund_status")
    .eq("id", params.bookingId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "booking_not_found" };

  const existing = String((data as { refund_status?: string | null }).refund_status ?? "").toLowerCase();
  if (existing === "chargeback") return { ok: true };

  const nowIso = new Date().toISOString();
  const { error: upErr } = await admin
    .from("bookings")
    .update({
      refunded_at: (data as { refunded_at?: string | null }).refunded_at ?? nowIso,
      refund_status: "chargeback",
    })
    .eq("id", params.bookingId);
  if (upErr) return { ok: false, error: upErr.message };

  await maybeProcessReferralClawbackOnBookingChange({
    admin,
    bookingId: params.bookingId,
    newStatus: (data as { status?: string | null }).status,
    refundedAt: nowIso,
    refundStatus: "chargeback",
  });

  await logSystemEvent({
    level: "warn",
    source: "booking/chargeback",
    message: "booking.chargeback.recorded",
    context: {
      bookingId: params.bookingId,
      paystackReference: params.paystackReference ?? null,
      note: params.note?.slice(0, 200) ?? null,
    },
  });

  return { ok: true };
}
