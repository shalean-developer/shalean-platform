import "server-only";

import { getServiceLabel, type BookingServiceId } from "@/components/booking/serviceCategories";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { deriveAdminClientPaymentStatus, isStoredPaymentLinkUsable } from "@/lib/booking/adminPaymentLinkState";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function refsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export type PayBookingLandingOk = {
  ok: true;
  bookingId: string;
  serviceLabel: string;
  date: string | null;
  time: string | null;
  amountZar: number | null;
  authorizationUrl: string;
  payment_link_expires_at: string | null;
};

export type PayBookingLandingErr = {
  ok: false;
  httpStatus: number;
  error: string;
  payment_status?: string;
};

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

  const { data: row, error } = await admin
    .from("bookings")
    .select(
      "id, status, paystack_reference, payment_link, payment_link_expires_at, service, date, time, total_paid_zar, booking_snapshot",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !row || typeof row !== "object") {
    return { ok: false, httpStatus: 404, error: "We could not find this booking." };
  }

  const r = row as Record<string, unknown>;
  const paystackRef = typeof r.paystack_reference === "string" ? r.paystack_reference : "";
  if (!paystackRef || !refsMatch(paystackRef, reference)) {
    return { ok: false, httpStatus: 403, error: "Invalid payment reference." };
  }

  const status = String(r.status ?? "").toLowerCase();
  if (status !== "pending_payment") {
    const ps = deriveAdminClientPaymentStatus({
      status: status,
      payment_link: typeof r.payment_link === "string" ? r.payment_link : null,
      payment_link_expires_at: typeof r.payment_link_expires_at === "string" ? r.payment_link_expires_at : null,
    });
    return {
      ok: false,
      httpStatus: 410,
      error: status === "payment_expired" ? "This payment link has expired." : "This booking is no longer awaiting payment.",
      payment_status: ps,
    };
  }

  if (
    !isStoredPaymentLinkUsable({
      status: status,
      payment_link: typeof r.payment_link === "string" ? r.payment_link : null,
      payment_link_expires_at: typeof r.payment_link_expires_at === "string" ? r.payment_link_expires_at : null,
    })
  ) {
    return { ok: false, httpStatus: 410, error: "This payment link has expired.", payment_status: "expired" };
  }

  const snap = r.booking_snapshot as BookingSnapshotV1 | null;
  const locked = snap?.locked;
  const lockedRec = locked && typeof locked === "object" ? (locked as Record<string, unknown>) : null;
  const serviceId = lockedRec?.service;
  const serviceLabel =
    typeof serviceId === "string" && serviceId.trim()
      ? getServiceLabel(serviceId as BookingServiceId)
      : r.service != null
        ? String(r.service)
        : "Cleaning";

  const totalZarRaw = r.total_paid_zar;
  const amountZar =
    typeof totalZarRaw === "number" && Number.isFinite(totalZarRaw)
      ? Math.round(totalZarRaw)
      : typeof totalZarRaw === "string" && /^\d+(\.\d+)?$/.test(String(totalZarRaw).trim())
        ? Math.round(Number(totalZarRaw))
        : null;

  const paymentUrl = typeof r.payment_link === "string" ? r.payment_link : "";
  if (!paymentUrl) {
    return { ok: false, httpStatus: 410, error: "No checkout link is available for this booking." };
  }

  return {
    ok: true,
    bookingId: String(r.id),
    serviceLabel,
    date: r.date != null ? String(r.date) : null,
    time: r.time != null ? String(r.time) : null,
    amountZar,
    authorizationUrl: paymentUrl,
    payment_link_expires_at: r.payment_link_expires_at != null ? String(r.payment_link_expires_at) : null,
  };
}
