import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTotalPaidCents } from "@/lib/payout/calculateCleanerPayout";

/** Booking `payment_status` values that imply customer settlement for recompute heuristics. */
const PAID_LIKE_PAYMENT_STATUS = new Set(["paid", "success", "succeeded"]);

/**
 * Columns used for paid-signal + refund guards. Keep in sync with migrations
 * `20260805_bookings_customer_paid_at.sql` and `20260806_bookings_refund_tracking.sql`.
 *
 * **Deploy safety:** `paid_at`, `refunded_at`, and `refund_status` are omitted from SELECT unless
 * `SHALEAN_BOOKINGS_FINANCIAL_SNAPSHOT_COLS=1` so an app revision never queries missing columns
 * before migrations land.
 */
export function bookingsPersistFullFinancialSelectSuffix(): string {
  return process.env.SHALEAN_BOOKINGS_FINANCIAL_SNAPSHOT_COLS === "1" ? ",paid_at,refunded_at,refund_status" : "";
}

/** Column list for `persistCleanerPayoutIfUnset` and stuck-zero repair scans. */
export function bookingsPersistSelectListForPersist(): string {
  return (
    "id, cleaner_id, payout_id, payout_owner_cleaner_id, team_id, is_team_job, date, time, total_paid_zar, total_paid_cents, amount_paid_cents, base_amount_cents, service_fee_cents, service, booking_snapshot, cleaner_payout_cents, cleaner_bonus_cents, company_revenue_cents, display_earnings_cents, payment_status" +
    bookingsPersistFullFinancialSelectSuffix()
  );
}

export type BookingPaidSignalRow = {
  id?: string;
  total_paid_zar?: number | null;
  total_paid_cents?: number | null;
  amount_paid_cents?: number | null;
  payment_status?: string | null;
  paid_at?: string | null;
  refunded_at?: string | null;
  refund_status?: string | null;
};

/** When true, do not treat paid-like rows as candidates for earnings recompute (refund / reversal). */
export function bookingPaymentRecomputeBlockedByRefund(r: BookingPaidSignalRow): boolean {
  const ra = r.refunded_at;
  if (ra != null && String(ra).trim() !== "") return true;
  const rs = String(r.refund_status ?? "").trim().toLowerCase();
  if (!rs) return false;
  return ["refunded", "full", "partial", "chargeback", "reversed", "failed_after_success"].includes(rs);
}

/**
 * Whether a row with `display_earnings_cents = 0` should be treated as **stuck** and recomputed.
 * Uses several signals so we are not blocked when one column lags (webhook order, partial writes).
 */
export function bookingSignalsPaidForZeroDisplayRecompute(r: BookingPaidSignalRow): boolean {
  if (bookingPaymentRecomputeBlockedByRefund(r)) return false;
  if (resolveTotalPaidCents(r.total_paid_zar, r.total_paid_cents ?? r.amount_paid_cents) > 0) return true;
  const tpc = Number(r.total_paid_cents);
  if (Number.isFinite(tpc) && tpc > 0) return true;
  const apc = Number(r.amount_paid_cents);
  if (Number.isFinite(apc) && apc > 0) return true;
  const ps = String(r.payment_status ?? "").trim().toLowerCase();
  if (PAID_LIKE_PAYMENT_STATUS.has(ps)) return true;
  if (r.paid_at != null && String(r.paid_at).trim() !== "") return true;
  return false;
}

export type BookingPersistIdsRow = {
  cleaner_id?: string | null;
  payout_owner_cleaner_id?: string | null;
  is_team_job?: boolean | null;
};

/**
 * Cleaner id used for `persistCleanerPayoutIfUnset` — team jobs use payout owner; solo uses `cleaner_id`.
 */
export function resolvePersistCleanerIdForBooking(row: BookingPersistIdsRow): string | null {
  const isTeam = row.is_team_job === true;
  const owner = String(row.payout_owner_cleaner_id ?? "").trim();
  const cid = String(row.cleaner_id ?? "").trim();
  if (isTeam && owner) return owner;
  if (cid) return cid;
  if (owner) return owner;
  return null;
}

/**
 * `display_earnings_cents` is considered persisted for integrity checks when it is non-null
 * and finite (including **0** — free / promo / test jobs).
 */
export function hasPersistedDisplayEarningsBasis(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
}

/** @deprecated Use {@link hasPersistedDisplayEarningsBasis}. Name is misleading: **0** is valid persisted display earnings. */
export const hasPositiveDisplayEarningsCents = hasPersistedDisplayEarningsBasis;

export async function fetchBookingDisplayEarningsCents(
  admin: SupabaseClient,
  bookingId: string,
): Promise<number | null> {
  const { data, error } = await admin.from("bookings").select("display_earnings_cents").eq("id", bookingId).maybeSingle();
  if (error || !data) return null;
  const v = (data as { display_earnings_cents?: unknown }).display_earnings_cents;
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Math.round(Number(v));
}
