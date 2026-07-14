/**
 * Candidate selection for BK-001 pending collected-cash anomaly repair.
 * Kept free of I/O so unit tests can cover exclusion rules.
 */

export type PendingCashAnomalyCandidate = {
  id: string;
  status: string | null;
  payment_status: string | null;
  amount_paid_cents: number | null;
  total_paid_cents: number | null;
  total_paid_zar: number | null;
  total_price: number | null;
  payment_completed_at: string | null;
  payment_transaction_id: string | null;
  marked_paid_by_admin_id?: string | null;
  /** True when a settled Paystack (or other gateway) ledger row exists for the booking. */
  hasSettledGatewayLedger?: boolean;
  /** True when an R0 promo_credit_cover ledger exists for the booking. */
  hasR0CoverLedger?: boolean;
};

export function evaluatePendingCollectedCashAnomalyCandidate(
  row: PendingCashAnomalyCandidate,
): { ok: true } | { ok: false; reason: string } {
  const st = String(row.status ?? "").toLowerCase();
  const ps = String(row.payment_status ?? "").toLowerCase();

  if (st !== "pending_payment" && st !== "payment_expired") {
    return { ok: false, reason: "status_not_pending" };
  }
  if (ps === "success" || ps === "paid" || ps === "succeeded" || ps === "pending_monthly") {
    return { ok: false, reason: "payment_status_settled" };
  }
  if (row.payment_completed_at) return { ok: false, reason: "has_payment_completed_at" };
  if (row.payment_transaction_id) return { ok: false, reason: "has_payment_transaction_id" };
  if (row.marked_paid_by_admin_id) return { ok: false, reason: "manual_or_admin_paid" };
  if (row.hasSettledGatewayLedger) return { ok: false, reason: "has_settled_gateway_ledger" };
  if (row.hasR0CoverLedger) return { ok: false, reason: "has_r0_cover_ledger" };

  const cents = Number(row.amount_paid_cents ?? 0);
  const zar = Number(row.total_paid_zar ?? 0);
  const totalPaidCents = Number(row.total_paid_cents ?? 0);
  if (!(cents > 0 || zar > 0 || totalPaidCents > 0)) {
    return { ok: false, reason: "no_positive_cash" };
  }
  return { ok: true };
}

export function looksLikeProductionSupabaseUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u) return false;
  if (u.includes("localhost") || u.includes("127.0.0.1")) return false;
  if (u.includes(".supabase.co")) return true;
  return false;
}
