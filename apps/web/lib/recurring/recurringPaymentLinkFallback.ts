import "server-only";

import { getServiceLabel, type BookingServiceId } from "@/components/booking/serviceCategories";
import { adminPaymentLinkTtlMs } from "@/lib/booking/adminPaymentLinkState";
import { processPaystackInitializeBody } from "@/lib/booking/paystackInitializeCore";
import { deliverAdminPaymentLink } from "@/lib/admin/adminPaymentLinkDelivery";
import { persistPaymentLinkDelivery } from "@/lib/admin/persistPaymentLinkDelivery";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { recordPaymentLinkDecision, resolvePaymentLinkDispatchDecision } from "@/lib/pay/paymentDecisionDispatch";
import { trustPayPageUrl } from "@/lib/pay/trustPayPageUrl";
import type { SupabaseClient } from "@supabase/supabase-js";

type BookingHead = {
  id: string;
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
  "id, customer_name, customer_phone, customer_email, service, date, time, total_paid_zar, payment_link_send_count, payment_link_first_sent_at, payment_link_delivery, payment_conversion_bucket, payment_last_touch_channel";

/**
 * Phase 1 payment-link + decision engine, invoked when recurring auto-charge fails.
 */
export async function runRecurringPaymentLinkFallback(admin: SupabaseClient, bookingId: string): Promise<boolean> {
  const { data: row, error } = await admin
    .from("bookings")
    .select("id, user_id, customer_email, customer_name, customer_phone, booking_snapshot, date, time, total_paid_zar")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !row || typeof row !== "object") {
    await reportOperationalIssue("error", "recurring/fallback", error?.message ?? "booking missing", { bookingId });
    return false;
  }

  const snap = (row as { booking_snapshot?: unknown }).booking_snapshot;
  const locked =
    snap && typeof snap === "object" && snap !== null && "locked" in snap ? (snap as { locked?: unknown }).locked : null;
  if (!locked || typeof locked !== "object") {
    await reportOperationalIssue("warn", "recurring/fallback", "booking_snapshot.locked missing", { bookingId });
    return false;
  }

  const email = String((row as { customer_email?: string | null }).customer_email ?? "").trim();
  const name = String((row as { customer_name?: string | null }).customer_name ?? "").trim();
  const phone = String((row as { customer_phone?: string | null }).customer_phone ?? "").trim();
  const preservedUserId =
    typeof (row as { user_id?: string | null }).user_id === "string" ? String((row as { user_id: string }).user_id) : null;

  if (!email || name.length < 2 || phone.length < 5) {
    await reportOperationalIssue("warn", "recurring/fallback", "incomplete customer contact for Paystack init", {
      bookingId,
    });
    return false;
  }

  const init = await processPaystackInitializeBody({
    bookingId,
    email,
    locked,
    tip: 0,
    promoCode: "",
    customer: {
      type: "guest",
      name,
      email,
      phone,
      userId: "",
    },
    relaxedLockValidation: true,
  });

  if (!init.ok) {
    await reportOperationalIssue("error", "recurring/fallback", init.error, { bookingId });
    return false;
  }
  if (!init.authorizationUrl || !init.reference) {
    await reportOperationalIssue("error", "recurring/fallback", "missing authorizationUrl or reference", { bookingId });
    return false;
  }

  const expiresAt = new Date(Date.now() + adminPaymentLinkTtlMs()).toISOString();

  const { error: patchErr } = await admin
    .from("bookings")
    .update({
      payment_link: init.authorizationUrl,
      payment_link_expires_at: expiresAt,
      ...(preservedUserId ? { user_id: preservedUserId } : {}),
    })
    .eq("id", bookingId)
    .eq("status", "pending_payment");

  if (patchErr) {
    await reportOperationalIssue("error", "recurring/fallback", patchErr.message, { bookingId });
    return false;
  }

  await admin.from("bookings").update({ recurring_fallback_at: new Date().toISOString() }).eq("id", bookingId);

  const { data: headRow } = await admin.from("bookings").select(HEAD_SELECT).eq("id", bookingId).maybeSingle();
  const head = headRow as BookingHead | null;
  if (!head) return true;

  const lockedRec = locked as Record<string, unknown>;
  const serviceId = lockedRec?.service;
  const serviceLabel =
    typeof serviceId === "string" && serviceId.trim()
      ? getServiceLabel(serviceId as BookingServiceId)
      : head.service != null
        ? String(head.service)
        : "Cleaning";
  const dateLabel = head.date != null ? String(head.date) : "—";
  const timeLabel = head.time != null ? String(head.time) : "—";

  const totalZarRaw = head.total_paid_zar;
  const amountZar =
    typeof totalZarRaw === "number" && Number.isFinite(totalZarRaw)
      ? Math.round(totalZarRaw)
      : typeof totalZarRaw === "string" && /^\d+(\.\d+)?$/.test(totalZarRaw.trim())
        ? Math.round(Number(totalZarRaw))
        : null;

  try {
    const decision = await resolvePaymentLinkDispatchDecision(
      admin,
      {
        id: head.id,
        customer_email: head.customer_email,
        customer_phone: head.customer_phone,
        payment_link_send_count: head.payment_link_send_count,
        payment_conversion_bucket: head.payment_conversion_bucket,
        payment_link_first_sent_at: head.payment_link_first_sent_at,
        payment_link_delivery: head.payment_link_delivery,
        payment_last_touch_channel: head.payment_last_touch_channel,
      },
      { intent: "initial_send", notificationMode: "chain_plus_email" },
    );
    await recordPaymentLinkDecision(
      admin,
      {
        id: head.id,
        customer_email: head.customer_email,
        customer_phone: head.customer_phone,
        payment_link_send_count: head.payment_link_send_count,
        payment_conversion_bucket: head.payment_conversion_bucket,
        payment_link_first_sent_at: head.payment_link_first_sent_at,
        payment_link_delivery: head.payment_link_delivery,
        payment_last_touch_channel: head.payment_last_touch_channel,
      },
      decision,
      "initial_send",
    );

    const linkForMessaging = trustPayPageUrl(head.id, init.reference, init.authorizationUrl);
    const delivery = await deliverAdminPaymentLink({
      phone: String(head.customer_phone ?? "").trim() || null,
      email: String(head.customer_email ?? "").trim() || null,
      mode: "chain_plus_email",
      phoneTryOrder: decision.phoneTryOrder.length ? decision.phoneTryOrder : undefined,
      emailPayload: {
        customerEmail: String(head.customer_email ?? "").trim(),
        customerName: String(head.customer_name ?? "").trim() || null,
        serviceLabel,
        dateLabel,
        timeLabel,
        amountZar,
        paymentUrl: init.authorizationUrl,
        bookingId: head.id,
        paystackReference: init.reference,
      },
      waPayload: {
        customerName: String(head.customer_name ?? "").trim() || "there",
        paymentLink: linkForMessaging,
        service: serviceLabel,
        date: dateLabel,
        time: timeLabel,
      },
      context: { bookingId: head.id, stage: "recurring_auto_charge_fallback" },
    });
    await persistPaymentLinkDelivery(admin, head.id, delivery, { passType: "admin_initial" });
  } catch (e) {
    await reportOperationalIssue("error", "recurring/fallback/delivery", String(e), { bookingId });
  }

  await logSystemEvent({
    level: "info",
    source: "recurring/payment_link_fallback",
    message: "recurring_payment_link_initialized",
    context: { booking_id: bookingId, reference: init.reference },
  });

  return true;
}
