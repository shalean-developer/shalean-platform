import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { persistPaymentLinkDelivery } from "@/lib/admin/persistPaymentLinkDelivery";
import { paymentLinkSendAllowed } from "@/lib/admin/paymentLinkSendGate";
import { deliverAdminPaymentLink } from "@/lib/admin/adminPaymentLinkDelivery";
import { deriveAdminClientPaymentStatus, isStoredPaymentLinkUsable } from "@/lib/booking/adminPaymentLinkState";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getServiceLabel, type BookingServiceId } from "@/components/booking/serviceCategories";
import { trustPayPageUrl } from "@/lib/pay/trustPayPageUrl";
import { recordPaymentLinkDecision, resolvePaymentLinkDispatchDecision } from "@/lib/pay/paymentDecisionDispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function twilioRefPreview(sid: string | null | undefined): string | null {
  const s = typeof sid === "string" ? sid.trim() : "";
  if (!s) return null;
  if (s.length <= 12) return s;
  return `${s.slice(0, 3)}…${s.slice(-4)}`;
}

type Row = {
  id: string;
  user_id: string | null;
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
  booking_snapshot: unknown;
  payment_link_send_count: number | null;
  payment_link_first_sent_at: string | null;
  payment_link_delivery: unknown;
  payment_conversion_bucket: string | null;
  payment_last_touch_channel: string | null;
};

/**
 * Resend payment link notifications only (no new Paystack session).
 * Fails with 410 when the link is missing or expired — use `POST /api/admin/bookings/with-payment`
 * with `bookingId` + full checkout body and `forceNewCheckout: true` to regenerate.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId?.trim()) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

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

  let notificationMode: "chain" | "chain_plus_email" = "chain_plus_email";
  let skipSms = false;
  try {
    const raw = await request.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      if (raw.notificationMode === "chain") notificationMode = "chain";
      if (raw.skipSms === true || raw.skipSms === "true") skipSms = true;
    }
  } catch {
    /* empty body */
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: row, error } = await admin
    .from("bookings")
    .select(
      "id, user_id, status, payment_link, payment_link_expires_at, payment_link_last_sent_at, paystack_reference, customer_name, customer_phone, customer_email, service, date, time, total_paid_zar, booking_snapshot, payment_link_send_count, payment_link_first_sent_at, payment_link_delivery, payment_conversion_bucket, payment_last_touch_channel",
    )
    .eq("id", bookingId.trim())
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const r = row as Row;
  if (String(r.status ?? "").toLowerCase() !== "pending_payment") {
    return NextResponse.json(
      {
        error: "Booking is not awaiting payment.",
        payment_status: deriveAdminClientPaymentStatus(r),
      },
      { status: 409 },
    );
  }

  if (!isStoredPaymentLinkUsable(r) || !r.payment_link || !r.paystack_reference) {
    return NextResponse.json(
      {
        error: "Payment link is missing or expired. Create a new checkout with with-payment and forceNewCheckout.",
        payment_status: deriveAdminClientPaymentStatus(r),
      },
      { status: 410 },
    );
  }

  const snap = r.booking_snapshot;
  const locked =
    snap && typeof snap === "object" && snap !== null && "locked" in snap
      ? (snap as { locked?: unknown }).locked
      : null;

  const lockedRec = locked && typeof locked === "object" && !Array.isArray(locked) ? (locked as Record<string, unknown>) : null;
  const serviceId = lockedRec?.service;
  const serviceLabel =
    typeof serviceId === "string" && serviceId.trim()
      ? getServiceLabel(serviceId as BookingServiceId)
      : r.service != null
        ? String(r.service)
        : "Cleaning";
  const dateLabel = r.date != null ? String(r.date) : "—";
  const timeLabel = r.time != null ? String(r.time) : "—";
  const name = String(r.customer_name ?? "").trim();
  const phone = String(r.customer_phone ?? "").trim();
  const email = String(r.customer_email ?? "").trim();

  const totalZarRaw = r.total_paid_zar;
  const amountZar =
    typeof totalZarRaw === "number" && Number.isFinite(totalZarRaw)
      ? Math.round(totalZarRaw)
      : typeof totalZarRaw === "string" && /^\d+(\.\d+)?$/.test(totalZarRaw.trim())
        ? Math.round(Number(totalZarRaw))
        : null;

  const gate = paymentLinkSendAllowed(r);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "Please wait before resending payment notifications.", retryAfterSec: gate.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
    );
  }

  await logSystemEvent({
    level: "info",
    source: "admin_booking_resend_payment_link",
    message: "admin_payment_link_resend_notifications",
    context: {
      type: "admin_checkout_resend",
      booking_id: r.id,
      admin_id: user.id,
      skip_sms: skipSms,
    },
  });

  const linkForMessaging = trustPayPageUrl(r.id, r.paystack_reference, r.payment_link);

  const decision = await resolvePaymentLinkDispatchDecision(
    admin,
    {
      id: r.id,
      customer_email: r.customer_email,
      customer_phone: r.customer_phone,
      payment_link_send_count: r.payment_link_send_count,
      payment_conversion_bucket: r.payment_conversion_bucket,
      payment_link_first_sent_at: r.payment_link_first_sent_at,
      payment_link_delivery: r.payment_link_delivery,
      payment_last_touch_channel: r.payment_last_touch_channel,
    },
    { intent: "admin_resend", notificationMode },
  );
  await recordPaymentLinkDecision(
    admin,
    {
      id: r.id,
      customer_email: r.customer_email,
      customer_phone: r.customer_phone,
      payment_link_send_count: r.payment_link_send_count,
      payment_conversion_bucket: r.payment_conversion_bucket,
      payment_link_first_sent_at: r.payment_link_first_sent_at,
      payment_link_delivery: r.payment_link_delivery,
      payment_last_touch_channel: r.payment_last_touch_channel,
    },
    decision,
    "admin_resend",
  );

  const delivery = await deliverAdminPaymentLink({
    phone: phone || null,
    email: email || null,
    mode: notificationMode,
    supabaseAdmin: admin,
    bookingId: r.id,
    userId: r.user_id,
    skipSms,
    phoneTryOrder: decision.phoneTryOrder.length ? decision.phoneTryOrder : undefined,
    emailPayload: {
      customerEmail: email,
      customerName: name || null,
      serviceLabel,
      dateLabel,
      timeLabel,
      amountZar,
      paymentUrl: r.payment_link,
      bookingId: r.id,
      paystackReference: r.paystack_reference,
    },
    waPayload: {
      customerName: name || "there",
      paymentLink: linkForMessaging,
      service: serviceLabel,
      date: dateLabel,
      time: timeLabel,
    },
    context: { bookingId: r.id, stage: "admin_payment_link_resend" },
  });

  await persistPaymentLinkDelivery(admin, r.id, delivery, { pass: "admin_resend", passType: "admin_resend" });

  return NextResponse.json({
    ok: true,
    bookingId: r.id,
    authorizationUrl: r.payment_link,
    reference: r.paystack_reference,
    payment_status: deriveAdminClientPaymentStatus(r),
    payment_link_expires_at: r.payment_link_expires_at,
    primary_channel: delivery.primaryChannel,
    delivery,
    sms_twilio_ref_preview: twilioRefPreview(delivery.twilioSmsSid),
    sms_twilio_sid: delivery.twilioSmsSid ?? null,
  });
}
