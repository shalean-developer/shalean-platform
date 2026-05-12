import "server-only";

/** Default TTL when Paystack does not return an expiry (minutes). */
export function adminPaymentLinkTtlMs(): number {
  const n = Number(process.env.ADMIN_PAYMENT_LINK_EXPIRES_MINUTES ?? "60");
  const min = Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, 5), 168 * 60) : 60;
  return min * 60 * 1000;
}

/**
 * Customer checkout payment-link TTL.
 *
 * Mirrors `adminPaymentLinkTtlMs()` but scoped to the customer-side
 * `pending_payment` row created by `insertPendingPaymentBookingRow`.
 *
 * Why a separate helper: production Readiness Audit H-3 found that
 * customer Paystack `pending_payment` rows historically were inserted
 * without `payment_link_expires_at`, so the
 * `/api/cron/expire-pending-payments` cron — which filters on
 * `payment_link_expires_at IS NOT NULL AND < now()` — could never sweep
 * them. Stamping a TTL at insert time fixes that. Ops gets a separate
 * env knob (`CUSTOMER_PAYMENT_LINK_EXPIRES_MINUTES`) so customer and
 * admin TTLs can be tuned independently without forcing a redeploy.
 *
 * Defaults match `adminPaymentLinkTtlMs()` (60 min) and are clamped to
 * the same `[5 min, 7 days]` band so a misconfigured env can't disable
 * expiry or push it absurdly far out.
 */
export function customerPaymentLinkTtlMs(): number {
  const n = Number(process.env.CUSTOMER_PAYMENT_LINK_EXPIRES_MINUTES ?? "60");
  const min = Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, 5), 168 * 60) : 60;
  return min * 60 * 1000;
}

export type AdminClientPaymentStatus = "pending" | "paid" | "expired";

type BookingLike = {
  status?: string | null;
  payment_link?: string | null;
  payment_link_expires_at?: string | null;
};

/**
 * Ops-facing payment state (not a DB column).
 * - `expired`: `payment_expired` row, or `pending_payment` with link TTL passed.
 * - `paid`: post-checkout lifecycle (non–pending_payment / non–payment_expired).
 * - `pending`: awaiting payment or no link yet.
 */
export function deriveAdminClientPaymentStatus(row: BookingLike, nowMs: number = Date.now()): AdminClientPaymentStatus {
  const st = String(row.status ?? "").trim().toLowerCase();
  if (st === "payment_expired") return "expired";
  if (st !== "pending_payment") return "paid";
  const link = typeof row.payment_link === "string" && row.payment_link.trim() ? row.payment_link.trim() : "";
  const expRaw = row.payment_link_expires_at;
  if (link && expRaw) {
    const expMs = new Date(String(expRaw)).getTime();
    if (Number.isFinite(expMs) && nowMs > expMs) return "expired";
  }
  return "pending";
}

export function isStoredPaymentLinkUsable(row: BookingLike, nowMs: number = Date.now()): boolean {
  const link = typeof row.payment_link === "string" && row.payment_link.trim() ? row.payment_link.trim() : "";
  if (!link) return false;
  return deriveAdminClientPaymentStatus(row, nowMs) === "pending";
}
