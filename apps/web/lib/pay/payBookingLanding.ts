import "server-only";

import { getServiceLabel, type BookingServiceId } from "@/components/booking/serviceCategories";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { ensureBookingPaymentSession } from "@/lib/booking/ensureBookingPaymentSession";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PayBookingLandingOk = {
  ok: true;
  bookingId: string;
  serviceLabel: string;
  date: string | null;
  time: string | null;
  amountZar: number | null;
  authorizationUrl: string;
  payment_link_expires_at: string | null;
  /** True when a fresh Paystack session replaced an expired/missing link. */
  refreshed?: boolean;
  message?: string;
  /** Current Paystack reference (may differ from the URL `ref` after refresh). */
  reference: string;
};

export type PayBookingLandingErr = {
  ok: false;
  httpStatus: number;
  error: string;
  payment_status?: string;
  /** When true, redirect customer to success. */
  alreadyPaid?: boolean;
  bookingId?: string;
  reference?: string;
  retryable?: boolean;
};

/**
 * Branded `/pay/[bookingId]?ref=` loader.
 * Recovers missing/expired Paystack checkout URLs via {@link ensureBookingPaymentSession}.
 */
export async function loadPayBookingLanding(bookingId: string, ref: string): Promise<PayBookingLandingOk | PayBookingLandingErr> {
  const id = bookingId.trim();
  const reference = ref.trim();
  if (!id || !reference) {
    return { ok: false, httpStatus: 400, error: "Missing booking id or payment reference." };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, httpStatus: 503, error: "Service unavailable." };
  }

  const session = await ensureBookingPaymentSession(admin, {
    bookingId: id,
    access: { kind: "paystack_ref", reference },
  });

  if (session.status === "paid") {
    return {
      ok: false,
      httpStatus: 410,
      error: "This booking has already been paid.",
      payment_status: "paid",
      alreadyPaid: true,
      bookingId: session.bookingId,
      reference: session.reference,
    };
  }

  if (session.status === "failed") {
    const httpStatus =
      session.errorCode === "PAYMENT_ACCESS_DENIED"
        ? 403
        : session.errorCode === "PAYMENT_BOOKING_NOT_FOUND"
          ? 404
          : session.errorCode === "PAYMENT_CONFIGURATION_ERROR"
            ? 503
            : session.retryable
              ? 503
              : 410;
    return {
      ok: false,
      httpStatus,
      error: session.error,
      bookingId: session.bookingId,
      retryable: session.retryable,
    };
  }

  const { data: row } = await admin
    .from("bookings")
    .select("service, booking_snapshot")
    .eq("id", session.bookingId)
    .maybeSingle();

  const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
  const snap = r.booking_snapshot as BookingSnapshotV1 | null;
  const locked = snap?.locked;
  const lockedRec = locked && typeof locked === "object" ? (locked as Record<string, unknown>) : null;
  const serviceId = lockedRec?.service;
  const serviceLabel =
    typeof serviceId === "string" && serviceId.trim()
      ? getServiceLabel(serviceId as BookingServiceId)
      : session.serviceLabel?.trim()
        ? session.serviceLabel
        : r.service != null
          ? String(r.service)
          : "Cleaning";

  return {
    ok: true,
    bookingId: session.bookingId,
    serviceLabel,
    date: session.date ?? null,
    time: session.time ?? null,
    amountZar: session.amountZar,
    authorizationUrl: session.authorizationUrl,
    payment_link_expires_at: session.payment_link_expires_at,
    refreshed: session.refreshed,
    message: session.message,
    reference: session.reference,
  };
}
