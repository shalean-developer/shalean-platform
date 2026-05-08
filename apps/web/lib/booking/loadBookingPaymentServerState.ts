import "server-only";

import { bookingRowToPaymentSummary } from "@/lib/payments/bookingPaymentSummary";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { BOOKING_PAYMENT_UUID_RE } from "@/lib/booking/bookingPaymentUuid";
import type { BookingPaymentServerState } from "@/lib/booking/bookingPaymentTypes";

export type { BookingPaymentBlockedReason, BookingPaymentServerState } from "@/lib/booking/bookingPaymentTypes";

type BookingRow = {
  id: string;
  status?: string | null;
  payment_completed_at?: string | null;
  customer_email?: string | null;
  service?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  extras?: unknown;
  total_price?: number | string | null;
  total_paid_zar?: number | null;
  booking_snapshot?: unknown;
};

export async function loadBookingPaymentServerState(bookingId: string): Promise<BookingPaymentServerState> {
  if (!BOOKING_PAYMENT_UUID_RE.test(bookingId)) {
    return { status: "blocked", reason: { kind: "not_found" } };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { status: "blocked", reason: { kind: "admin_unavailable" } };
  }

  const { data: row, error } = await admin
    .from("bookings")
    .select("id, customer_email, service, rooms, bathrooms, extras, total_price, total_paid_zar, status, booking_snapshot, payment_completed_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !row) {
    return { status: "blocked", reason: { kind: "not_found" } };
  }

  const r = row as BookingRow;

  if (r.status !== "pending_payment") {
    const paid = r.payment_completed_at != null && String(r.payment_completed_at).trim() !== "";
    return { status: "blocked", reason: { kind: "wrong_status", paid, bookingId: r.id } };
  }

  const summary = bookingRowToPaymentSummary(r);
  if (!summary.email?.trim()) {
    return { status: "blocked", reason: { kind: "missing_email" } };
  }
  if (summary.priceZar <= 0) {
    return { status: "blocked", reason: { kind: "invalid_amount" } };
  }

  return { status: "ready", summary };
}
