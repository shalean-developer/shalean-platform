import "server-only";

import { bookingRowToPaymentSummary } from "@/lib/payments/bookingPaymentSummary";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { BOOKING_PAYMENT_UUID_RE } from "@/lib/booking/bookingPaymentUuid";
import type { BookingPaymentServerState } from "@/lib/booking/bookingPaymentTypes";

export type { BookingPaymentBlockedReason, BookingPaymentServerState } from "@/lib/booking/bookingPaymentTypes";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  selected_cleaner_id?: string | null;
  assignment_type?: string | null;
  service_slug?: string | null;
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
    .select(
      "id, customer_email, service, service_slug, rooms, bathrooms, extras, total_price, total_paid_zar, status, booking_snapshot, payment_completed_at, selected_cleaner_id, assignment_type",
    )
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

  /**
   * Defense-in-depth: legacy rows / older funnel paths may have `selected_cleaner_id` set on the
   * row but no `cleaner_name` on the snapshot. Resolve here so `BookingReviewPanel` shows the
   * actual cleaner the customer picked instead of the generic "Best available cleaner" copy.
   * Failure to resolve falls back to a stable "Selected cleaner" label.
   */
  const selRaw = String(r.selected_cleaner_id ?? "").trim();
  const selectedCleanerId = UUID_RE.test(selRaw) ? selRaw : null;
  if (selectedCleanerId) {
    const snap = (r.booking_snapshot ?? null) as Record<string, unknown> | null;
    const snapCleanerName =
      snap && typeof snap === "object" && typeof snap.cleaner_name === "string"
        ? snap.cleaner_name.trim()
        : "";
    if (!snapCleanerName) {
      let resolvedName = "Selected cleaner";
      try {
        const { data: clRow } = await admin
          .from("cleaners")
          .select("full_name")
          .eq("id", selectedCleanerId)
          .maybeSingle();
        const fn =
          clRow && typeof clRow === "object" && "full_name" in clRow
            ? String((clRow as { full_name?: string | null }).full_name ?? "").trim()
            : "";
        if (fn) resolvedName = fn;
      } catch {
        /* keep fallback label */
      }
      const baseSnap: Record<string, unknown> =
        snap && typeof snap === "object" ? { ...snap } : { v: 1 };
      baseSnap.cleaner_id = selectedCleanerId;
      baseSnap.cleaner_name = resolvedName;
      r.booking_snapshot = baseSnap;
    }
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
