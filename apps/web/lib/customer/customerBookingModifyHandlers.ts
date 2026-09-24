import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { bookingCustomerKey } from "@/lib/booking/bookingCustomerIdentity";
import {
  loadCustomerBookingRowForUser,
  resolveBookingOwnershipColumn,
} from "@/lib/customer/customerBookingsForUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyCustomerBookingCancelled } from "@/lib/notifications/customerUserNotifications";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { logSystemEvent } from "@/lib/logging/systemLog";
import {
  CUSTOMER_RESCHEDULE_REDISPATCH_STATUSES,
  isCustomerCancellableBookingStatus,
  isCustomerReschedulableBookingStatus,
} from "@/lib/dashboard/customerBookingModifyStatuses";
import { expirePendingDispatchOffersForBooking } from "@/lib/dispatch/expirePendingDispatchOffersForBooking";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { releaseCleaningCreditForBooking } from "@/lib/referrals/creditReservations";
import { reverseAppliedPromotionRedemptionsForBooking } from "@/lib/promotions/server";
import { discardPendingRecurringPrepaymentForBooking } from "@/lib/recurring/recurringPrepaymentLedger";
import { fetchPaystackTransactionVerify } from "@/lib/payments/verifyPaystackTransaction";
import {
  markPaymentEditSupersedeCleanupDone,
  readPaymentEditSupersedeMarker,
  withPaymentEditSupersedeMarker,
} from "@/lib/booking/paymentEditSupersedeMarker";
import {
  BOOKING_MIN_LEAD_MINUTES,
  billingMonthFromYmd,
  filterBookableTimeSlots,
  johannesburgTodayYmd,
} from "@/lib/dashboard/bookingSlotTimes";

export type CustomerBookingAuthResult =
  | { ok: true; userId: string; viewerEmail: string | null; admin: SupabaseClient }
  | { ok: false; response: NextResponse };

export async function authenticateCustomerBookingRequest(
  request: Request,
): Promise<CustomerBookingAuthResult> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Missing authorization." }, { status: 401 }) };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: false, response: NextResponse.json({ error: "Server configuration error." }, { status: 503 }) };
  }

  const pub = createClient(url, anon);
  const { data: userData, error: userErr } = await pub.auth.getUser(token);
  if (userErr || !userData.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Invalid or expired session." }, { status: 401 }) };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, response: NextResponse.json({ error: "Server configuration error." }, { status: 503 }) };
  }

  return {
    ok: true,
    userId: userData.user.id,
    viewerEmail: userData.user.email ?? null,
    admin,
  };
}

type PendingPaymentEditRow = {
  id: string;
  status?: string | null;
  payment_status?: string | null;
  payment_completed_at?: string | null;
  amount_paid_cents?: number | null;
  paystack_reference?: string | null;
  payment_link?: string | null;
  booking_snapshot?: unknown;
  total_price?: number | string | null;
};

function pendingPaymentHasSettledEvidence(row: PendingPaymentEditRow): boolean {
  const paymentStatus = String(row.payment_status ?? "").trim().toLowerCase();
  const amountPaidCents = Number(row.amount_paid_cents ?? 0);
  return (
    Boolean(String(row.payment_completed_at ?? "").trim()) ||
    paymentStatus === "paid" ||
    paymentStatus === "success" ||
    (Number.isFinite(amountPaidCents) && amountPaidCents > 0)
  );
}

async function cleanupAbandonedPendingPayment(
  auth: Extract<CustomerBookingAuthResult, { ok: true }>,
  row: PendingPaymentEditRow,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const creditRelease = await releaseCleaningCreditForBooking(auth.admin, row.id);
  if (!creditRelease.ok && creditRelease.error !== "reservation_not_found") {
    return { ok: false, error: `Cleaning Credit release failed: ${creditRelease.error}` };
  }

  const revenueRaw = Number(row.total_price ?? 0);
  const promotionRelease = await reverseAppliedPromotionRedemptionsForBooking(auth.admin, {
    bookingId: row.id,
    bookingRevenueZar: Number.isFinite(revenueRaw) ? Math.max(0, Math.round(revenueRaw)) : 0,
  });
  if (!promotionRelease.ok) {
    return { ok: false, error: `Promotion release failed: ${promotionRelease.error}` };
  }

  const recurringRelease = await discardPendingRecurringPrepaymentForBooking(auth.admin, row.id);
  if (!recurringRelease.ok) {
    return { ok: false, error: `Recurring prepayment release failed: ${recurringRelease.error}` };
  }

  return { ok: true };
}

/**
 * Booking V2 payment edit boundary.
 *
 * A customer may return from Paystack and keep retrying the exact same unpaid
 * booking. Once they edit the booking, however, the old price/reference must be
 * superseded before live pricing resumes. This command is owner-only, verifies
 * Paystack did not already succeed, makes the old row non-payable, then releases
 * checkout reservations so a fresh confirm can create the replacement booking.
 */
export async function handleCustomerPendingPaymentAbandonForEdit(
  auth: Extract<CustomerBookingAuthResult, { ok: true }>,
  bookingId: string,
): Promise<NextResponse> {
  const ownershipColumn = await resolveBookingOwnershipColumn(auth.admin);
  const { data, error: loadErr } = await auth.admin
    .from("bookings")
    .select(
      `id, status, payment_status, payment_completed_at, amount_paid_cents, paystack_reference, payment_link, booking_snapshot, total_price, ${ownershipColumn}`,
    )
    .eq("id", bookingId)
    .eq(ownershipColumn, auth.userId)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json(
      { ok: false, code: "PAYMENT_EDIT_LOAD_FAILED", error: "Could not load the pending payment." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, code: "BOOKING_NOT_FOUND", error: "Pending payment not found." },
      { status: 404 },
    );
  }

  const row = data as PendingPaymentEditRow;
  if (pendingPaymentHasSettledEvidence(row)) {
    return NextResponse.json(
      {
        ok: false,
        code: "PAYMENT_ALREADY_COMPLETED",
        error: "This payment has already completed and cannot be replaced.",
      },
      { status: 409 },
    );
  }

  const status = String(row.status ?? "").trim().toLowerCase();
  const existingMarker = readPaymentEditSupersedeMarker(row.booking_snapshot);

  // Idempotent retry after the status transition: finish any cleanup that did
  // not complete on the first request, then let the browser unlock fresh pricing.
  if (status === "payment_expired" && existingMarker) {
    if (!existingMarker.cleanup_done_at) {
      const cleanup = await cleanupAbandonedPendingPayment(auth, row);
      if (!cleanup.ok) {
        void logSystemEvent({
          level: "error",
          source: "customer_pending_payment_edit",
          message: "Superseded payment cleanup failed",
          context: { bookingId, error: cleanup.error },
        });
        return NextResponse.json(
          { ok: false, code: "PAYMENT_EDIT_CLEANUP_FAILED", error: cleanup.error },
          { status: 503 },
        );
      }

      const { error: markerErr } = await auth.admin
        .from("bookings")
        .update({
          booking_snapshot: markPaymentEditSupersedeCleanupDone(
            row.booking_snapshot,
            new Date().toISOString(),
          ),
        })
        .eq("id", bookingId)
        .eq(ownershipColumn, auth.userId)
        .eq("status", "payment_expired");
      if (markerErr) {
        return NextResponse.json(
          {
            ok: false,
            code: "PAYMENT_EDIT_CLEANUP_FAILED",
            error: "Could not finish releasing the previous payment session.",
          },
          { status: 503 },
        );
      }
    }

    return NextResponse.json({ ok: true, bookingId, alreadySuperseded: true });
  }

  if (status !== "pending_payment") {
    return NextResponse.json(
      {
        ok: false,
        code: "PAYMENT_NOT_PENDING",
        error: "This booking is no longer waiting for payment.",
      },
      { status: 409 },
    );
  }

  // If a real Paystack checkout was created, fail closed unless the gateway
  // confirms that transaction is still unpaid. This closes the race where the
  // customer pays and immediately navigates back before webhook/verify persistence.
  const reference = String(row.paystack_reference ?? "").trim();
  const paymentLink = String(row.payment_link ?? "").trim();
  if (reference && paymentLink) {
    const secret = process.env.PAYSTACK_SECRET_KEY?.trim() ?? "";
    if (!secret) {
      return NextResponse.json(
        {
          ok: false,
          code: "PAYMENT_STATUS_UNAVAILABLE",
          error: "Could not verify the previous payment safely. Please try again shortly.",
        },
        { status: 503 },
      );
    }

    const verified = await fetchPaystackTransactionVerify(reference, secret);
    if (verified.status !== true || !verified.data) {
      return NextResponse.json(
        {
          ok: false,
          code: "PAYMENT_STATUS_UNAVAILABLE",
          error: "Could not verify the previous payment safely. Please try again shortly.",
        },
        { status: 503 },
      );
    }

    if (String(verified.data.status ?? "").trim().toLowerCase() === "success") {
      return NextResponse.json(
        {
          ok: false,
          code: "PAYMENT_ALREADY_COMPLETED",
          error: "Paystack reports this payment as successful. The booking cannot be replaced.",
        },
        { status: 409 },
      );
    }
  }

  const nowIso = new Date().toISOString();
  const markedSnapshot = withPaymentEditSupersedeMarker(row.booking_snapshot, {
    supersededAt: nowIso,
    paystackReference: reference || null,
  });

  const { data: transitioned, error: transitionErr } = await auth.admin
    .from("bookings")
    .update({
      status: "payment_expired",
      dispatch_status: "unassigned",
      payment_link: null,
      payment_link_expires_at: nowIso,
      payment_needs_follow_up: false,
      booking_snapshot: markedSnapshot,
    })
    .eq("id", bookingId)
    .eq(ownershipColumn, auth.userId)
    .eq("status", "pending_payment")
    .is("payment_completed_at", null)
    .select("id")
    .maybeSingle();

  if (transitionErr) {
    return NextResponse.json(
      {
        ok: false,
        code: "PAYMENT_EDIT_SUPERSEDE_FAILED",
        error: "Could not replace the pending payment. Please try again.",
      },
      { status: 500 },
    );
  }
  if (!transitioned) {
    return NextResponse.json(
      {
        ok: false,
        code: "PAYMENT_EDIT_RACE",
        error: "The payment changed while your edit was being prepared. Please try again.",
      },
      { status: 409 },
    );
  }

  const cleanup = await cleanupAbandonedPendingPayment(auth, {
    ...row,
    booking_snapshot: markedSnapshot,
  });
  if (!cleanup.ok) {
    void logSystemEvent({
      level: "error",
      source: "customer_pending_payment_edit",
      message: "Superseded payment cleanup failed",
      context: { bookingId, error: cleanup.error },
    });
    return NextResponse.json(
      { ok: false, code: "PAYMENT_EDIT_CLEANUP_FAILED", error: cleanup.error },
      { status: 503 },
    );
  }

  const { error: cleanupMarkerErr } = await auth.admin
    .from("bookings")
    .update({
      booking_snapshot: markPaymentEditSupersedeCleanupDone(
        markedSnapshot,
        new Date().toISOString(),
      ),
    })
    .eq("id", bookingId)
    .eq(ownershipColumn, auth.userId)
    .eq("status", "payment_expired");
  if (cleanupMarkerErr) {
    return NextResponse.json(
      {
        ok: false,
        code: "PAYMENT_EDIT_CLEANUP_FAILED",
        error: "Could not finish releasing the previous payment session.",
      },
      { status: 503 },
    );
  }

  void logSystemEvent({
    level: "info",
    source: "customer_pending_payment_edit",
    message: "Superseded stale pending payment before booking requote",
    context: { bookingId, paystackReference: reference || null },
  });

  return NextResponse.json({ ok: true, bookingId, alreadySuperseded: false });
}

export async function handleCustomerBookingCancel(
  auth: Extract<CustomerBookingAuthResult, { ok: true }>,
  bookingId: string,
): Promise<NextResponse> {
  const load = await loadCustomerBookingRowForUser(auth.admin, auth.userId, bookingId, {
    viewerEmail: auth.viewerEmail,
  });
  if (!load.ok) {
    return NextResponse.json({ error: load.error }, { status: load.status });
  }

  const row = load.booking;
  const status = String(row.status ?? "").toLowerCase();
  if (!isCustomerCancellableBookingStatus(status)) {
    return NextResponse.json({ error: "This booking cannot be cancelled." }, { status: 400 });
  }

  if (row.started_at) {
    return NextResponse.json({ error: "Cannot cancel after the clean has started." }, { status: 400 });
  }

  const invId = row.monthly_invoice_id;
  if (invId) {
    const { data: inv } = await auth.admin.from("monthly_invoices").select("is_closed").eq("id", invId).maybeSingle();
    const closed = Boolean(inv && typeof inv === "object" && (inv as { is_closed?: boolean }).is_closed);
    if (closed) {
      return NextResponse.json(
        {
          error:
            "This booking sits on a closed billing month and can’t be cancelled online. Please contact support for changes.",
        },
        { status: 409 },
      );
    }
  }

  const { expiredCount, error: offerExpireErr } = await expirePendingDispatchOffersForBooking(auth.admin, bookingId);
  if (offerExpireErr) {
    return NextResponse.json({ error: offerExpireErr }, { status: 500 });
  }

  const ownershipColumn = await resolveBookingOwnershipColumn(auth.admin);
  const { error: upErr } = await auth.admin
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_by: "customer",
      cleaner_payout_cents: 0,
      cleaner_bonus_cents: 0,
      company_revenue_cents: 0,
      payout_percentage: null,
      payout_type: "cancelled_zero",
    })
    .eq("id", bookingId)
    .eq(ownershipColumn, auth.userId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  void logSystemEvent({
    level: "info",
    source: "customer_booking_cancel",
    message: "Expired pending dispatch offers on customer cancel",
    context: { bookingId, expiredCount },
  });

  void logSystemEvent({
    level: "info",
    source: "customer_booking_cancel",
    message: "Cancelled booking payout set to zero",
    context: { bookingId },
  });

  const custEmail = String(row.customer_email ?? "").trim();
  void notifyBookingEvent({
    type: "cancelled",
    supabase: auth.admin,
    bookingId,
    customerEmail: custEmail,
    serviceLabel: row.service ?? null,
    dateYmd: row.date ?? null,
    timeHm: row.time ?? null,
  });

  const ownerId = bookingCustomerKey(row);
  if (ownerId) {
    void notifyCustomerBookingCancelled(auth.admin, {
      bookingId,
      userId: ownerId,
      serviceLabel: row.service ?? null,
      dateYmd: row.date ?? null,
      timeHm: row.time ?? null,
    });
  }

  return NextResponse.json({ ok: true });
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isHm(s: string): boolean {
  return /^\d{2}:\d{2}$/.test(s);
}

export async function handleCustomerBookingReschedule(
  auth: Extract<CustomerBookingAuthResult, { ok: true }>,
  bookingId: string,
  body: { date?: string; time?: string },
): Promise<NextResponse> {
  const date = typeof body.date === "string" ? body.date.trim() : "";
  const timeRaw = typeof body.time === "string" ? body.time.trim() : "";
  const time = timeRaw.length >= 5 ? timeRaw.slice(0, 5) : timeRaw;
  if (!isYmd(date) || !isHm(time)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) and time (HH:MM) required." }, { status: 400 });
  }

  const nowSnapshot = new Date();
  const todayJhb = johannesburgTodayYmd(nowSnapshot);
  if (date < todayJhb) {
    return NextResponse.json({ error: "Booking date cannot be in the past." }, { status: 400 });
  }
  const bookableSlots = filterBookableTimeSlots(date, { now: nowSnapshot, leadMinutes: BOOKING_MIN_LEAD_MINUTES });
  if (date === todayJhb && bookableSlots.length === 0) {
    return NextResponse.json(
      { error: "No bookable times remain today with the required notice. Please pick another date." },
      { status: 400 },
    );
  }
  if (!bookableSlots.includes(time)) {
    return NextResponse.json(
      {
        error: `Please choose a time at least ${BOOKING_MIN_LEAD_MINUTES / 60} hours from now (Johannesburg time).`,
      },
      { status: 400 },
    );
  }

  const load = await loadCustomerBookingRowForUser(auth.admin, auth.userId, bookingId, {
    viewerEmail: auth.viewerEmail,
  });
  if (!load.ok) {
    return NextResponse.json({ error: load.error }, { status: load.status });
  }

  const row = load.booking;
  const status = String(row.status ?? "").toLowerCase();
  if (!isCustomerReschedulableBookingStatus(status)) {
    return NextResponse.json({ error: "This booking cannot be rescheduled." }, { status: 400 });
  }

  if (row.started_at || row.en_route_at) {
    return NextResponse.json({ error: "Cannot reschedule after the cleaner is on the way or started." }, { status: 400 });
  }

  const prevDate = String(row.date ?? "");
  const prevTimeRaw = String(row.time ?? "");
  const prevTime = prevTimeRaw.length >= 5 ? prevTimeRaw.slice(0, 5) : prevTimeRaw;

  const linkedMonthly = Boolean(row.monthly_invoice_id);
  const pendingMonthly = String(row.payment_status ?? "").toLowerCase() === "pending_monthly";
  const monthlyFlag = Boolean(row.is_monthly_billing_booking);
  const oldYm = billingMonthFromYmd(prevDate);
  const newYm = billingMonthFromYmd(date);
  if ((linkedMonthly || pendingMonthly || monthlyFlag) && oldYm && newYm && oldYm !== newYm) {
    return NextResponse.json(
      {
        error:
          "Cannot reschedule across calendar months for a monthly-billed visit. Contact support if the job must move to another billing month.",
      },
      { status: 409 },
    );
  }

  const ownershipColumn = await resolveBookingOwnershipColumn(auth.admin);
  const { error: upErr } = await auth.admin
    .from("bookings")
    .update({ date, time })
    .eq("id", bookingId)
    .eq(ownershipColumn, auth.userId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const custEmail = String(row.customer_email ?? "").trim();
  void notifyBookingEvent({
    type: "rescheduled",
    supabase: auth.admin,
    bookingId,
    customerEmail: custEmail,
    previousDate: prevDate,
    previousTime: prevTime,
    newDate: date,
    newTime: time,
    serviceLabel: row.service ?? null,
  });

  const cleanerId = row.cleaner_id;
  const autoDispatch = process.env.AUTO_DISPATCH_CLEANERS !== "false";
  if (CUSTOMER_RESCHEDULE_REDISPATCH_STATUSES.has(status) && !cleanerId && autoDispatch) {
    void ensureBookingAssignment(auth.admin, bookingId, { source: "customer_reschedule" });
  }

  return NextResponse.json({ ok: true });
}

export function withDeprecatedDashboardBookingApi(
  response: NextResponse,
  successorPath: string,
): NextResponse {
  response.headers.set("Deprecation", "true");
  response.headers.set("Link", `<${successorPath}>; rel="successor-version"`);
  response.headers.set("Sunset", "Sun, 01 Jun 2027 00:00:00 GMT");
  return response;
}
