import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { deliverAdminPaymentLink } from "@/lib/admin/adminPaymentLinkDelivery";
import { persistPaymentLinkDelivery } from "@/lib/admin/persistPaymentLinkDelivery";
import { paymentLinkSendAllowed } from "@/lib/admin/paymentLinkSendGate";
import { getServiceLabel, type BookingServiceId } from "@/components/booking/serviceCategories";
import { isAdmin } from "@/lib/auth/admin";
import {
  adminPaymentLinkTtlMs,
  deriveAdminClientPaymentStatus,
  isStoredPaymentLinkUsable,
} from "@/lib/booking/adminPaymentLinkState";
import { processPaystackInitializeBody } from "@/lib/booking/paystackInitializeCore";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PaymentLinkPassType } from "@/lib/pay/paymentLinkDeliveryEvents";
import { trustPayPageUrl } from "@/lib/pay/trustPayPageUrl";
import { recordPaymentLinkDecision, resolvePaymentLinkDispatchDecision } from "@/lib/pay/paymentDecisionDispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingHead = {
  id: string;
  status: string | null;
  payment_link: string | null;
  payment_link_expires_at: string | null;
  payment_link_last_sent_at: string | null;
  paystack_reference: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
  total_paid_zar: number | string | null;
  payment_link_send_count: number | null;
  payment_link_first_sent_at: string | null;
  payment_link_delivery: unknown;
  payment_conversion_bucket: string | null;
  payment_last_touch_channel: string | null;
};

function boolish(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "string") return ["1", "true", "yes"].includes(v.trim().toLowerCase());
  return false;
}

const HEAD_SELECT =
  "id, status, payment_link, payment_link_expires_at, payment_link_last_sent_at, paystack_reference, customer_name, customer_phone, customer_email, service, date, time, total_paid_zar, payment_link_send_count, payment_link_first_sent_at, payment_link_delivery, payment_conversion_bucket, payment_last_touch_channel";

/**
 * Admin-only: same pipeline as customer checkout (`processPaystackInitializeBody`).
 * Body shape matches `POST /api/paystack/initialize` (locked, email, customer, tip, …).
 *
 * Idempotency: pass `bookingId` for an existing `pending_payment` row with a **non-expired** link
 * to return the stored URL without a new Paystack initialize (unless `forceNewCheckout` is true).
 * Set `resendNotifications: true` to re-run WhatsApp → SMS → email on a reused link (rate-limited).
 *
 * `notificationMode`: `chain_plus_email` (default) or `chain` (email only if phone channels fail).
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);

  if (userErr || !user?.email || !user.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    body = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const bookingIdFromBody =
    typeof body.bookingId === "string" && body.bookingId.trim()
      ? body.bookingId.trim()
      : typeof body.booking_id === "string" && body.booking_id.trim()
        ? body.booking_id.trim()
        : null;

  const forceNewCheckout = boolish(body.forceNewCheckout);
  const resendNotifications = boolish(body.resendNotifications);
  const notificationMode =
    body.notificationMode === "chain" ? ("chain" as const) : ("chain_plus_email" as const);

  if (bookingIdFromBody && !forceNewCheckout) {
    const { data: existing, error: exErr } = await admin.from("bookings").select(HEAD_SELECT).eq("id", bookingIdFromBody).maybeSingle();

    if (exErr) {
      await reportOperationalIssue("error", "admin/bookings/with-payment", exErr.message, { bookingId: bookingIdFromBody });
      return NextResponse.json({ error: "Could not load booking." }, { status: 500 });
    }

    if (!existing || typeof existing !== "object" || !("id" in existing)) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    const row = existing as BookingHead;
    const status = String(row.status ?? "").trim().toLowerCase();

    if (status !== "pending_payment") {
      const paymentStatus = deriveAdminClientPaymentStatus(row);
      await logSystemEvent({
        level: "info",
        source: "admin_booking_with_payment",
        message: "admin_checkout_rejected_already_paid",
        context: {
          type: "admin_checkout_guard",
          booking_id: row.id,
          admin_id: user.id,
          booking_status: row.status,
          payment_status: paymentStatus,
        },
      });
      return NextResponse.json(
        {
          error: "Booking is not awaiting payment (already paid or closed).",
          payment_status: paymentStatus,
          bookingId: row.id,
        },
        { status: 409 },
      );
    }

    if (isStoredPaymentLinkUsable(row) && row.payment_link && row.paystack_reference) {
      await logSystemEvent({
        level: "info",
        source: "admin_booking_with_payment",
        message: "admin_payment_link_reused",
        context: {
          type: "admin_checkout_idempotent",
          booking_id: row.id,
          admin_id: user.id,
          resend_notifications: resendNotifications,
        },
      });

      if (resendNotifications) {
        const gate = paymentLinkSendAllowed(row);
        if (!gate.allowed) {
          return NextResponse.json(
            { error: "Please wait before resending payment notifications.", retryAfterSec: gate.retryAfterSec },
            { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
          );
        }
        await sendDeliveryForRow(admin, {
          row,
          authorizationUrl: row.payment_link,
          reference: row.paystack_reference,
          notificationMode,
          locked: body.locked,
          passType: "admin_resend",
        });
      }

      return NextResponse.json({
        ok: true,
        reused: true,
        authorizationUrl: row.payment_link,
        reference: row.paystack_reference,
        bookingId: row.id,
        payment_status: deriveAdminClientPaymentStatus(row),
        payment_link_expires_at: row.payment_link_expires_at,
        notificationsSent: resendNotifications,
      });
    }
  }

  const result = await processPaystackInitializeBody(body);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.errorCode != null ? { errorCode: result.errorCode } : {}) },
      { status: result.status },
    );
  }

  if (!result.bookingId) {
    await reportOperationalIssue("error", "admin/bookings/with-payment", "missing bookingId after Paystack init", {
      reference: result.reference,
    });
    return NextResponse.json(
      { error: "Checkout started but booking was not linked. Try again or check logs." },
      { status: 503 },
    );
  }

  const expiresAt = new Date(Date.now() + adminPaymentLinkTtlMs()).toISOString();

  const { error: patchErr } = await admin
    .from("bookings")
    .update({
      created_by_admin: true,
      created_by: user.id,
      payment_link: result.authorizationUrl,
      payment_link_expires_at: expiresAt,
    })
    .eq("id", result.bookingId)
    .eq("status", "pending_payment");

  if (patchErr) {
    await reportOperationalIssue("error", "admin/bookings/with-payment", patchErr.message, {
      bookingId: result.bookingId,
    });
    return NextResponse.json({ error: "Could not tag admin booking." }, { status: 500 });
  }

  const { data: row, error: rowErr } = await admin.from("bookings").select(HEAD_SELECT).eq("id", result.bookingId).maybeSingle();

  if (rowErr) {
    await reportOperationalIssue("warn", "admin/bookings/with-payment", rowErr.message, {
      bookingId: result.bookingId,
    });
  }

  await logSystemEvent({
    level: "info",
    source: "admin_booking_with_payment",
    message: "admin_created_payment_checkout",
    context: {
      type: "admin_checkout",
      booking_id: result.bookingId,
      admin_id: user.id,
      paystack_reference: result.reference,
      payment_link_expires_at: expiresAt,
    },
  });

  if (row && typeof row === "object" && "id" in row) {
    await sendDeliveryForRow(admin, {
      row: row as BookingHead,
      authorizationUrl: result.authorizationUrl,
      reference: result.reference,
      notificationMode,
      locked: body.locked,
    });
  }

  const head = row && typeof row === "object" ? (row as BookingHead) : null;

  return NextResponse.json({
    ok: true,
    reused: false,
    authorizationUrl: result.authorizationUrl,
    reference: result.reference,
    bookingId: result.bookingId,
    payment_status: head ? deriveAdminClientPaymentStatus({ ...head, payment_link_expires_at: expiresAt }) : "pending",
    payment_link_expires_at: expiresAt,
  });
}

async function sendDeliveryForRow(
  admin: SupabaseClient,
  params: {
    row: BookingHead;
    authorizationUrl: string;
    reference: string;
    notificationMode: "chain" | "chain_plus_email";
    locked: unknown;
    passType?: PaymentLinkPassType;
  },
): Promise<void> {
  const { row, authorizationUrl, reference, notificationMode, locked, passType = "admin_initial" } = params;
  const name = String(row.customer_name ?? "").trim();
  const phone = String(row.customer_phone ?? "").trim();
  const email = String(row.customer_email ?? "").trim();

  const lockedRec = locked && typeof locked === "object" && !Array.isArray(locked) ? (locked as Record<string, unknown>) : null;
  const serviceId = lockedRec?.service;
  const serviceLabel =
    typeof serviceId === "string" && serviceId.trim()
      ? getServiceLabel(serviceId as BookingServiceId)
      : row.service != null
        ? String(row.service)
        : "Cleaning";
  const dateLabel = row.date != null ? String(row.date) : "—";
  const timeLabel = row.time != null ? String(row.time) : "—";

  const totalZarRaw = row.total_paid_zar;
  const amountZar =
    typeof totalZarRaw === "number" && Number.isFinite(totalZarRaw)
      ? Math.round(totalZarRaw)
      : typeof totalZarRaw === "string" && /^\d+(\.\d+)?$/.test(totalZarRaw.trim())
        ? Math.round(Number(totalZarRaw))
        : null;

  try {
    const intent = passType === "admin_resend" ? "admin_resend" : "initial_send";
    const decision = await resolvePaymentLinkDispatchDecision(
      admin,
      {
        id: row.id,
        customer_email: row.customer_email,
        customer_phone: row.customer_phone,
        payment_link_send_count: row.payment_link_send_count,
        payment_conversion_bucket: row.payment_conversion_bucket,
        payment_link_first_sent_at: row.payment_link_first_sent_at,
        payment_link_delivery: row.payment_link_delivery,
        payment_last_touch_channel: row.payment_last_touch_channel,
      },
      { intent, notificationMode: notificationMode },
    );
    await recordPaymentLinkDecision(
      admin,
      {
        id: row.id,
        customer_email: row.customer_email,
        customer_phone: row.customer_phone,
        payment_link_send_count: row.payment_link_send_count,
        payment_conversion_bucket: row.payment_conversion_bucket,
        payment_link_first_sent_at: row.payment_link_first_sent_at,
        payment_link_delivery: row.payment_link_delivery,
        payment_last_touch_channel: row.payment_last_touch_channel,
      },
      decision,
      intent,
    );

    const linkForMessaging = trustPayPageUrl(row.id, reference, authorizationUrl);
    const delivery = await deliverAdminPaymentLink({
      phone: phone || null,
      email: email || null,
      mode: notificationMode,
      phoneTryOrder: decision.phoneTryOrder.length ? decision.phoneTryOrder : undefined,
      emailPayload: {
        customerEmail: email,
        customerName: name || null,
        serviceLabel,
        dateLabel,
        timeLabel,
        amountZar,
        paymentUrl: authorizationUrl,
        bookingId: row.id,
        paystackReference: reference,
      },
      waPayload: {
        customerName: name || "there",
        paymentLink: linkForMessaging,
        service: serviceLabel,
        date: dateLabel,
        time: timeLabel,
      },
      context: { bookingId: row.id, stage: "admin_payment_link" },
    });
    await persistPaymentLinkDelivery(admin, row.id, delivery, { passType });
  } catch (e) {
    await reportOperationalIssue("error", "admin/bookings/with-payment/delivery", String(e), {
      bookingId: row.id,
    });
  }
}
