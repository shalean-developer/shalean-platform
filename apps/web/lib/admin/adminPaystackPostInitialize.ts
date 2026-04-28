import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceLabel, type BookingServiceId } from "@/components/booking/serviceCategories";
import { adminBookingServiceSlug } from "@/lib/admin/adminBookingCreateFingerprint";
import { adminPaymentLinkTtlMs } from "@/lib/booking/adminPaymentLinkState";
import type { PaystackInitializeSuccess } from "@/lib/booking/paystackInitializeCore";
import { deliverAdminPaymentLink } from "@/lib/admin/adminPaymentLinkDelivery";
import { persistPaymentLinkDelivery } from "@/lib/admin/persistPaymentLinkDelivery";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { logSystemEvent } from "@/lib/logging/systemLog";
import type { PaymentLinkPassType } from "@/lib/pay/paymentLinkDeliveryEvents";
import { trustPayPageUrl } from "@/lib/pay/trustPayPageUrl";
import { recordPaymentLinkDecision, resolvePaymentLinkDispatchDecision } from "@/lib/pay/paymentDecisionDispatch";

export type AdminPaystackBookingHead = {
  id: string;
  user_id: string | null;
  payment_status?: string | null;
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

const HEAD_SELECT =
  "id, user_id, payment_status, status, payment_link, payment_link_expires_at, payment_link_last_sent_at, paystack_reference, customer_name, customer_phone, customer_email, service, date, time, total_paid_zar, payment_link_send_count, payment_link_first_sent_at, payment_link_delivery, payment_conversion_bucket, payment_last_touch_channel";

/**
 * Tags admin-created Paystack bookings and sends the payment link (same behavior as `with-payment` route).
 */
export async function finalizeAdminPaystackCheckout(params: {
  admin: SupabaseClient;
  adminUserId: string;
  result: PaystackInitializeSuccess;
  locked: unknown;
  notificationMode?: "chain" | "chain_plus_email";
}): Promise<{ ok: true; expiresAt: string } | { ok: false; error: string }> {
  const { admin, adminUserId, result, locked } = params;
  const notificationMode = params.notificationMode ?? "chain_plus_email";

  if (!result.bookingId) {
    await reportOperationalIssue("error", "adminPaystackPostInitialize", "missing bookingId after Paystack init", {
      reference: result.reference,
    });
    return { ok: false, error: "Checkout started but booking was not linked. Try again or check logs." };
  }

  const expiresAt = new Date(Date.now() + adminPaymentLinkTtlMs()).toISOString();

  const lockedRec = locked && typeof locked === "object" && !Array.isArray(locked) ? (locked as Record<string, unknown>) : null;
  const lockedService = typeof lockedRec?.service === "string" ? lockedRec.service.trim() : "";
  const serviceSlugUpdate = lockedService ? adminBookingServiceSlug(lockedService) : null;

  const { error: patchErr } = await admin
    .from("bookings")
    .update({
      created_by_admin: true,
      created_by: adminUserId,
      payment_link: result.authorizationUrl,
      payment_link_expires_at: expiresAt,
      ...(serviceSlugUpdate ? { service_slug: serviceSlugUpdate } : {}),
    })
    .eq("id", result.bookingId)
    .eq("status", "pending_payment");

  if (patchErr) {
    await reportOperationalIssue("error", "adminPaystackPostInitialize", patchErr.message, {
      bookingId: result.bookingId,
    });
    return { ok: false, error: "Could not tag admin booking." };
  }

  const { data: row, error: rowErr } = await admin.from("bookings").select(HEAD_SELECT).eq("id", result.bookingId).maybeSingle();

  if (rowErr) {
    await reportOperationalIssue("warn", "adminPaystackPostInitialize", rowErr.message, {
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
      admin_id: adminUserId,
      paystack_reference: result.reference,
      payment_link_expires_at: expiresAt,
    },
  });

  if (row && typeof row === "object" && "id" in row) {
    await sendAdminPaystackDeliveryForRow(admin, {
      row: row as AdminPaystackBookingHead,
      authorizationUrl: result.authorizationUrl,
      reference: result.reference,
      notificationMode,
      locked,
    });
  }

  return { ok: true, expiresAt };
}

export async function sendAdminPaystackDeliveryForRow(
  admin: SupabaseClient,
  params: {
    row: AdminPaystackBookingHead;
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
      { intent, notificationMode },
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
      supabaseAdmin: admin,
      bookingId: row.id,
      userId: row.user_id,
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
    await reportOperationalIssue("error", "adminPaystackPostInitialize/delivery", String(e), {
      bookingId: row.id,
    });
  }
}
