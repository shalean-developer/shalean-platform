import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingUncollectedCashColumns } from "@/lib/booking/bookingPaidAmountColumns";
import { logPaymentStructured } from "@/lib/observability/paymentStructuredLog";
import { recordCoveredSettlement } from "@/lib/payments/recordCoveredSettlement";

export type SettleFullyCoveredBookingResult =
  | { ok: true; alreadySettled: boolean; paymentTransactionId: string }
  | { ok: false; error: string; code: "not_r0" | "persist_failed" | "ledger_failed" | "mismatch" | "invalid_status" };

type BookingSettleRow = {
  id: string;
  status: string | null;
  payment_status: string | null;
  total_price: number | string | null;
  payment_transaction_id: string | null;
  payment_completed_at: string | null;
};

type RpcSettleRow = {
  ok: boolean;
  error_message: string | null;
  payment_transaction_id: string | null;
  already_settled?: boolean | null;
};

function payableZar(totalPrice: number | string | null | undefined): number {
  const n = Number(totalPrice ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function isR0EligibleStatus(status: string | null | undefined, paymentStatus: string | null | undefined): boolean {
  const st = String(status ?? "").trim().toLowerCase();
  const ps = String(paymentStatus ?? "").trim().toLowerCase();
  if (st === "pending_payment" || st === "pending") return true;
  return ps === "success";
}

/**
 * R0 policy: fully covered bookings may settle with payment_status=success and
 * amount_paid_cents=0 when a promo_credit_cover ledger row is linked.
 *
 * Prefers DB RPC `settle_booking_fully_covered` (atomic). Falls back to
 * ledger-then-update when the migration is not yet applied.
 * Fallback enforces the same invariants as the RPC (payable=0, eligible status).
 */
export async function settleFullyCoveredBooking(
  admin: SupabaseClient,
  params: { bookingId: string; payAmountZar: number },
): Promise<SettleFullyCoveredBookingResult> {
  const bookingId = params.bookingId.trim();
  const payAmountZar = Math.max(0, Number(params.payAmountZar) || 0);

  logPaymentStructured("r0_settlement_started", {
    booking_id: bookingId,
    pay_amount_zar: payAmountZar,
  });

  if (payAmountZar > 0) {
    return { ok: false, error: "not_fully_covered", code: "not_r0" };
  }

  const rpc = await admin.rpc("settle_booking_fully_covered", { p_booking_id: bookingId });
  if (!rpc.error) {
    const row = Array.isArray(rpc.data)
      ? (rpc.data[0] as RpcSettleRow | undefined)
      : (rpc.data as RpcSettleRow | null);
    if (row?.ok && row.payment_transaction_id) {
      const alreadySettled = Boolean(row.already_settled);
      logPaymentStructured("r0_settlement_succeeded", {
        booking_id: bookingId,
        payment_transaction_id: row.payment_transaction_id,
        already_settled: alreadySettled,
        via: "rpc",
      });
      return {
        ok: true,
        alreadySettled,
        paymentTransactionId: String(row.payment_transaction_id),
      };
    }
    const err = row?.error_message ?? "r0_rpc_failed";
    if (err === "not_fully_covered") {
      return { ok: false, error: err, code: "not_r0" };
    }
    if (err === "invalid_status_for_r0") {
      return { ok: false, error: err, code: "invalid_status" };
    }
    logPaymentStructured("r0_settlement_failed", {
      booking_id: bookingId,
      reason: "rpc_failed",
      error: err,
    });
    return { ok: false, error: err, code: "persist_failed" };
  }

  // Fallback when RPC is missing (migration not applied yet).
  const missingFn =
    /settle_booking_fully_covered|PGRST202|Could not find the function/i.test(rpc.error.message ?? "") ||
    rpc.error.code === "PGRST202";
  if (!missingFn) {
    logPaymentStructured("r0_settlement_failed", {
      booking_id: bookingId,
      reason: "rpc_error",
      error: rpc.error.message,
    });
    return { ok: false, error: rpc.error.message, code: "persist_failed" };
  }

  return settleFullyCoveredBookingAppFallback(admin, bookingId);
}

async function settleFullyCoveredBookingAppFallback(
  admin: SupabaseClient,
  bookingId: string,
): Promise<SettleFullyCoveredBookingResult> {
  const { data: row, error: readErr } = await admin
    .from("bookings")
    .select("id, status, payment_status, total_price, payment_transaction_id, payment_completed_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (readErr || !row?.id) {
    logPaymentStructured("r0_settlement_failed", {
      booking_id: bookingId,
      reason: "booking_read_failed",
      error: readErr?.message ?? "not_found",
    });
    return { ok: false, error: readErr?.message ?? "booking_not_found", code: "persist_failed" };
  }

  const existing = row as BookingSettleRow;
  const ps = String(existing.payment_status ?? "")
    .trim()
    .toLowerCase();
  if (ps === "success" && existing.payment_transaction_id) {
    logPaymentStructured("r0_settlement_succeeded", {
      booking_id: bookingId,
      already_settled: true,
      payment_transaction_id: existing.payment_transaction_id,
      via: "app_fallback",
    });
    return {
      ok: true,
      alreadySettled: true,
      paymentTransactionId: String(existing.payment_transaction_id),
    };
  }

  if (payableZar(existing.total_price) > 0) {
    logPaymentStructured("r0_settlement_failed", {
      booking_id: bookingId,
      reason: "not_fully_covered",
      total_price: payableZar(existing.total_price),
    });
    return { ok: false, error: "not_fully_covered", code: "not_r0" };
  }

  if (!isR0EligibleStatus(existing.status, existing.payment_status)) {
    logPaymentStructured("r0_settlement_failed", {
      booking_id: bookingId,
      reason: "invalid_status_for_r0",
      booking_status: existing.status,
      payment_status: existing.payment_status,
    });
    return { ok: false, error: "invalid_status_for_r0", code: "invalid_status" };
  }

  const now = new Date().toISOString();
  const ledger = await recordCoveredSettlement(admin, {
    bookingId,
    paidAtIso: now,
    linkBookingPaymentTransactionId: false,
  });

  if (!ledger.ok) {
    logPaymentStructured("r0_settlement_failed", {
      booking_id: bookingId,
      reason: "ledger_failed",
      error: ledger.error,
    });
    return { ok: false, error: ledger.error, code: "ledger_failed" };
  }

  const { data: updated, error: updateErr } = await admin
    .from("bookings")
    .update({
      status: "pending",
      payment_status: "success",
      payment_completed_at: existing.payment_completed_at ?? now,
      billing_type: "prepaid",
      payment_transaction_id: ledger.paymentTransactionId,
      ...bookingUncollectedCashColumns(),
    })
    .eq("id", bookingId)
    .select("id, payment_status, amount_paid_cents, payment_transaction_id")
    .maybeSingle();

  if (updateErr || !updated?.id) {
    logPaymentStructured("r0_ledger_booking_mismatch", {
      booking_id: bookingId,
      payment_transaction_id: ledger.paymentTransactionId,
      reason: "booking_update_failed",
      error: updateErr?.message ?? "no_row",
    });
    logPaymentStructured("r0_settlement_failed", {
      booking_id: bookingId,
      reason: "booking_update_failed",
      error: updateErr?.message ?? "no_row",
    });
    return {
      ok: false,
      error: updateErr?.message ?? "Could not settle fully covered booking.",
      code: "persist_failed",
    };
  }

  const settledPs = String((updated as { payment_status?: string }).payment_status ?? "").toLowerCase();
  const settledTx = String((updated as { payment_transaction_id?: string }).payment_transaction_id ?? "");
  const settledCents = Number((updated as { amount_paid_cents?: number }).amount_paid_cents ?? -1);
  if (settledPs !== "success" || settledTx !== ledger.paymentTransactionId || settledCents !== 0) {
    logPaymentStructured("r0_ledger_booking_mismatch", {
      booking_id: bookingId,
      payment_transaction_id: ledger.paymentTransactionId,
      booking_payment_status: settledPs,
      booking_payment_transaction_id: settledTx || null,
      amount_paid_cents: settledCents,
    });
    return { ok: false, error: "r0_state_mismatch", code: "mismatch" };
  }

  logPaymentStructured("r0_settlement_succeeded", {
    booking_id: bookingId,
    already_settled: false,
    payment_transaction_id: ledger.paymentTransactionId,
    amount_paid_cents: 0,
    via: "app_fallback",
  });

  return {
    ok: true,
    alreadySettled: false,
    paymentTransactionId: ledger.paymentTransactionId,
  };
}
