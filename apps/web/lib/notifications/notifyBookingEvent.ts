import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceLabel } from "@/components/booking/serviceCategories";
import { sendCleanerNewJobEmail } from "@/lib/email/sendCleanerNotification";
import { buildBookingNotifyMessageFields, formatBookingNotifyPlainLines } from "@/lib/notifications/bookingNotifyFormat";
import { resolveDisplayEarnings } from "@/lib/cleaner/displayEarnings";
import {
  buildBookingEmailPayload,
  sendAdminHtmlEmail,
  sendBookingConfirmationEmail,
  sendCustomerBookingAssignedEmail,
  sendCustomerBookingCancelledEmail,
  sendCustomerJobCompletedEmail,
  sendCustomerRescheduledEmail,
  sendCustomerTwoHourReminderEmail,
  type BookingEmailPayload,
} from "@/lib/email/sendBookingEmail";
import { getCustomerContactHealthScore } from "@/lib/notifications/customerContactHealth";
import { inferCustomerCountryForNotifications } from "@/lib/notifications/notificationRegionPolicy";
import { customerPhoneToE164 } from "@/lib/notifications/customerPhoneNormalize";
import {
  sendCustomerSmsFromTemplate,
  type CustomerOutboundDecisionTrace,
  type SmsRole,
} from "@/lib/templates/customerOutbound";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { enqueueFailedJob } from "@/lib/booking/failedJobs";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { logPaymentStructured } from "@/lib/observability/paymentStructuredLog";
import {
  notifyCustomerBookingPlaced,
  notifyCustomerCleanerAssigned,
} from "@/lib/notifications/customerUserNotifications";
import { logPipelineEmailTelemetry } from "@/lib/notifications/notificationEmailTelemetry";
import { tryClaimNotificationDedupe } from "@/lib/notifications/notificationDedupe";
import { tryClaimNotificationIdempotency } from "@/lib/notifications/notificationIdempotencyClaim";
import { notifyBookingDebug } from "@/lib/notifications/notifyBookingDebug";
import { applyFallbackDelayIfNeeded } from "@/lib/ai-autonomy/optimizeTiming";
import { enqueueReviewSmsPromptQueue } from "@/lib/reviews/reviewPromptSms";
import { sendSmsFallback } from "@/lib/notifications/smsFallback";

export type NotifyBookingEventInput =
  | {
      type: "payment_confirmed";
      supabase: SupabaseClient;
      bookingId: string;
      snapshot: BookingSnapshotV1 | null;
      customerEmail: string;
      amountCents: number;
      paymentReference: string;
    }
  | { type: "assigned"; supabase: SupabaseClient; bookingId: string; cleanerId: string }
  | { type: "completed"; supabase: SupabaseClient; bookingId: string }
  | {
      type: "cancelled";
      supabase: SupabaseClient;
      bookingId: string;
      customerEmail: string;
      serviceLabel: string | null;
      dateYmd: string | null;
      timeHm: string | null;
    }
  | {
      type: "rescheduled";
      supabase: SupabaseClient;
      bookingId: string;
      customerEmail: string;
      previousDate: string;
      previousTime: string;
      newDate: string;
      newTime: string;
      serviceLabel: string | null;
    }
  | { type: "sla_breach"; supabase: SupabaseClient; bookingIds: string[]; minutes: number }
  | {
      type: "reminder_2h";
      supabase: SupabaseClient;
      bookingId: string;
      /** When true, also email customer (cron sets after in-app insert succeeds). */
      includeCustomerEmail: boolean;
    };

/** Booking lifecycle events that send an admin HTML email (excludes reminder_2h). */
type AdminMailEventType =
  | "payment_confirmed"
  | "assigned"
  | "completed"
  | "cancelled"
  | "rescheduled"
  | "sla_breach";

/**
 * `ADMIN_NOTIFICATION_LEVEL=critical` limits admin mail to high-signal ops events.
 * Default `all` (or unset) keeps every admin notification.
 */
function shouldSendAdminBookingMail(adminType: AdminMailEventType): boolean {
  const level = process.env.ADMIN_NOTIFICATION_LEVEL?.trim().toLowerCase();
  if (level !== "critical") return true;
  return adminType === "payment_confirmed" || adminType === "sla_breach" || adminType === "cancelled";
}

async function sendAdminIfConfigured(
  adminType: AdminMailEventType,
  context: Record<string, unknown>,
  send: () => Promise<void>,
): Promise<void> {
  if (!shouldSendAdminBookingMail(adminType)) return;
  if (!process.env.ADMIN_NOTIFICATION_EMAIL?.trim()) {
    console.warn("Admin email not configured");
    return;
  }
  try {
    await send();
  } catch (e) {
    console.error("Admin notification failed", e);
    await reportOperationalIssue("error", `notifyBookingEvent/${adminType}/admin`, String(e), context);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function adminBaseBlock(b: {
  bookingId: string;
  service: string;
  date: string;
  time: string;
  location: string;
  customerEmail?: string;
  paystackRef?: string;
}): string {
  return `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#111">
  <p><strong>Booking ID:</strong> <code>${escapeHtml(b.bookingId)}</code></p>
  <p><strong>Service:</strong> ${escapeHtml(b.service)}</p>
  <p><strong>Date / time:</strong> ${escapeHtml(b.date)} ${escapeHtml(b.time)}</p>
  <p><strong>Address:</strong> ${escapeHtml(b.location || "—")}</p>
  ${b.customerEmail ? `<p><strong>Customer:</strong> ${escapeHtml(b.customerEmail)}</p>` : ""}
  ${b.paystackRef ? `<p><strong>Payment ref:</strong> <code>${escapeHtml(b.paystackRef)}</code></p>` : ""}
</div>`;
}

async function enqueueNotificationDeliveryFailure(payload: {
  bookingId: string;
  eventType: string;
  channel: string;
  error: string;
}): Promise<void> {
  const ok = await enqueueFailedJob("notification_delivery", {
    bookingId: payload.bookingId,
    eventType: payload.eventType,
    channel: payload.channel,
    error: payload.error.slice(0, 4000),
    at: new Date().toISOString(),
  });
  if (!ok) {
    await reportOperationalIssue("warn", "notifyBookingEvent/notification_delivery", "failed_jobs insert failed", {
      bookingId: payload.bookingId,
      channel: payload.channel,
    });
  }
}

/**
 * Central orchestration for booking lifecycle notifications (customer email + in-app, cleaner SMS for assign/reminder, admin email).
 * Admin mail: skips admin HTML when `ADMIN_NOTIFICATION_EMAIL` is unset (logged); never throws.
 * Optional `ADMIN_NOTIFICATION_LEVEL=critical` limits admin mail to payment_confirmed, sla_breach, and cancelled.
 *
 * Channel policy: `notificationChannelRules.ts` (cleaner: SMS only; no cleaner SMS on `payment_confirmed`; customer payment_confirmed: email first, SMS only if email missing or failed; no customer WhatsApp).
 *
 * Idempotency: `reminder_2h_sent`, `assigned_sent`, `completed_sent`, `sla_breach_sent` claims use migration
 * `20260493_system_logs_notification_dedupe_idx.sql` (claim-first insert). Cleaner assignment/reminder SMS also uses
 * `notification_idempotency_claims` with stable synthetic references (`assigned_sms:v1:…`, `reminder_2h_sms:v1:…`).
 * `payment_confirmed` customer/admin/SMS/in-app uses Paystack `paymentReference` + event + channel (migration
 * `20260868_notification_idempotency_paystack_reference.sql`) so verify + webhook + retries cannot double-send.
 */
export async function notifyBookingEvent(event: NotifyBookingEventInput): Promise<void> {
  try {
  const { supabase } = event;

  notifyBookingDebug("notify_booking_event_start", {
    type: event.type,
    ...("bookingId" in event ? { bookingId: event.bookingId } : {}),
    ...(event.type === "sla_breach" ? { bookingIds: event.bookingIds, minutes: event.minutes } : {}),
    ...(event.type === "payment_confirmed" ? { paymentReference: event.paymentReference } : {}),
  });

  if (event.type === "payment_confirmed") {
    let debugEmailClaimed: boolean | null = null;
    let debugSmsClaimed: boolean | null = null;
    let debugCustomerSmsOk: boolean | null = null;
    const { data: bookingHead } = await supabase
      .from("bookings")
      .select("user_id, assignment_type, fallback_reason, customer_email, selected_cleaner_id")
      .eq("id", event.bookingId)
      .maybeSingle();
    const head =
      bookingHead && typeof bookingHead === "object" ? (bookingHead as Record<string, unknown>) : null;
    const rowCustomerEmailRaw = head ? String((head as { customer_email?: string | null }).customer_email ?? "") : "";
    const emailCandidates = [
      typeof event.customerEmail === "string" ? event.customerEmail : "",
      event.snapshot?.customer?.email ?? "",
      rowCustomerEmailRaw,
    ];
    let resolvedEmail = "";
    for (const raw of emailCandidates) {
      const n = normalizeEmail(raw);
      if (n && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n)) {
        resolvedEmail = n;
        break;
      }
    }
    const hasEmail = Boolean(resolvedEmail);
    const custPhone = event.snapshot?.customer?.phone?.trim();

    if (!process.env.RESEND_API_KEY?.trim()) {
      notifyBookingDebug("payment_confirmed_resend_missing", { bookingId: event.bookingId });
    }

    notifyBookingDebug("payment_confirmed_channels", {
      bookingId: event.bookingId,
      hasEmail,
      hasPhone: Boolean(custPhone),
      resendConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
      twilioConfigured: Boolean(
        process.env.TWILIO_ACCOUNT_SID?.trim() &&
          process.env.TWILIO_AUTH_TOKEN?.trim() &&
          process.env.TWILIO_FROM_NUMBER?.trim(),
      ),
    });

    if (!hasEmail && !custPhone) {
      await logSystemEvent({
        level: "warn",
        source: "notifyBookingEvent/payment_confirmed",
        message: "No delivery channel available",
        context: { bookingId: event.bookingId, stage: "payment_confirmed" },
      });
    }
    if (!hasEmail) {
      await logSystemEvent({
        level: "warn",
        source: "missing_customer_email",
        message: "No customer email on payment_confirmed — confirmation email skipped",
        context: { bookingId: event.bookingId, stage: "payment_confirmed" },
      });
    }
    const assignmentType = head ? String(head.assignment_type ?? "").trim() || null : null;
    const fallbackReason = head ? String(head.fallback_reason ?? "").trim() || null : null;

    let preferredNotificationChannel: "whatsapp" | "sms" | "email" | null = null;
    const payUserId = head ? String(head.user_id ?? "").trim() : "";
    if (payUserId) {
      const { data: profRow, error: profErr } = await supabase
        .from("user_profiles")
        .select("preferred_notification_channel")
        .eq("id", payUserId)
        .maybeSingle();
      if (!profErr && profRow && typeof profRow === "object") {
        const raw = String(
          (profRow as { preferred_notification_channel?: string | null }).preferred_notification_channel ?? "",
        )
          .trim()
          .toLowerCase();
        if (raw === "whatsapp" || raw === "sms" || raw === "email") {
          preferredNotificationChannel = raw;
        }
      }
    }

    const payload = buildBookingEmailPayload({
      paymentReference: event.paymentReference,
      amountCents: event.amountCents,
      customerEmail: resolvedEmail,
      snapshot: event.snapshot,
      bookingId: event.bookingId,
      assignmentType,
      fallbackReason,
    });
    let cust: { sent: boolean; error?: string } = { sent: false };
    if (hasEmail) {
      notifyBookingDebug("payment_confirmed_email_claim", { bookingId: event.bookingId });
      const claimedCustomerEmail = await tryClaimNotificationIdempotency(supabase, {
        reference: event.paymentReference,
        eventType: "payment_confirmed",
        channel: "email",
        bookingId: event.bookingId,
      });
      debugEmailClaimed = claimedCustomerEmail;
      if (claimedCustomerEmail) {
        try {
          cust = await sendBookingConfirmationEmail(payload);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          notifyBookingDebug("payment_confirmed_email_throw", { bookingId: event.bookingId, message: msg });
          await enqueueNotificationDeliveryFailure({
            bookingId: event.bookingId,
            eventType: "payment_confirmed",
            channel: "email",
            error: msg,
          });
        }
        if (!cust.sent && cust.error) {
          await reportOperationalIssue("error", "notifyBookingEvent/payment_confirmed", cust.error, {
            bookingId: event.bookingId,
          });
          await enqueueNotificationDeliveryFailure({
            bookingId: event.bookingId,
            eventType: "payment_confirmed",
            channel: "email",
            error: cust.error,
          });
        }
        await logPipelineEmailTelemetry({
          role: "customer",
          channel: "payment_confirmation",
          sent: cust.sent,
          error: cust.error,
          bookingId: event.bookingId,
        });
        if (cust.sent) {
          logPaymentStructured("notification_sent", {
            booking_id: event.bookingId,
            channel: "email",
            event_type: "payment_confirmed",
          });
        }
      } else {
        await logPipelineEmailTelemetry({
          role: "customer",
          channel: "payment_confirmation",
          sent: false,
          error: "dedupe_skip",
          bookingId: event.bookingId,
        });
      }
      notifyBookingDebug("payment_confirmed_email_result", {
        bookingId: event.bookingId,
        claimed: claimedCustomerEmail,
        sent: cust.sent,
        error: cust.error ?? null,
      });
    }

    const emailSent = hasEmail && cust.sent;
    if (custPhone && (!hasEmail || !cust.sent)) {
      const claimedSms = await tryClaimNotificationIdempotency(supabase, {
        reference: event.paymentReference,
        eventType: "payment_confirmed",
        channel: "sms",
        bookingId: event.bookingId,
      });
      debugSmsClaimed = claimedSms;
      if (claimedSms) {
        const phoneNotifyCtx = { bookingId: event.bookingId, stage: "payment_confirmed", channel: "customer_sms" };
        const country = inferCustomerCountryForNotifications({ phone: custPhone, snapshot: event.snapshot });
        const contactHealth = await getCustomerContactHealthScore({
          bookingId: event.bookingId,
          phoneHint: custPhone,
        });
        const forceSmsFromHealth =
          contactHealth != null && contactHealth.sampleSize >= 3 && contactHealth.score < 0.5;
        const healthFields: Pick<
          CustomerOutboundDecisionTrace,
          "contact_health_score" | "contact_health_sample_size"
        > =
          contactHealth != null
            ? {
                contact_health_score: Math.round(contactHealth.score * 1000) / 1000,
                contact_health_sample_size: contactHealth.sampleSize,
              }
            : {};
        const baseDecision: Pick<CustomerOutboundDecisionTrace, "country" | "preferred_channel"> = {
          country,
          preferred_channel: preferredNotificationChannel,
        };
        const decision: CustomerOutboundDecisionTrace["decision"] = !hasEmail
          ? "sms_primary_no_customer_email"
          : forceSmsFromHealth
            ? "email_failed_sms_fallback_contact_health"
            : "email_failed_sms_fallback";

        const paymentSmsRole: SmsRole = hasEmail && !cust.sent ? "fallback" : "primary";
        try {
          await applyFallbackDelayIfNeeded(supabase, {
            userId: payUserId || null,
            bookingId: event.bookingId,
            priceHint: event.amountCents / 100,
            flow: "payment",
          });
          const smsRet = await sendCustomerSmsFromTemplate({
            phone: custPhone,
            templateKey: "booking_confirmed",
            payload,
            smsRole: paymentSmsRole,
            context: {
              ...phoneNotifyCtx,
              channel: hasEmail ? "customer_sms_email_fallback" : "customer_sms_phone_only",
            },
            decisionTrace: {
              decision,
              ...baseDecision,
              ...healthFields,
            },
          });
          debugCustomerSmsOk = smsRet.ok;
          notifyBookingDebug("payment_confirmed_customer_sms_result", {
            bookingId: event.bookingId,
            ok: smsRet.ok,
            smsRole: paymentSmsRole,
            decision,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          debugCustomerSmsOk = false;
          notifyBookingDebug("payment_confirmed_customer_sms_throw", { bookingId: event.bookingId, message: msg });
          await enqueueNotificationDeliveryFailure({
            bookingId: event.bookingId,
            eventType: "payment_confirmed",
            channel: "sms",
            error: msg,
          });
        }
      } else {
        notifyBookingDebug("payment_confirmed_customer_sms_dedupe_skip", { bookingId: event.bookingId });
      }
    } else if (custPhone && emailSent) {
      notifyBookingDebug("payment_confirmed_customer_sms_skipped", {
        bookingId: event.bookingId,
        reason: "email_first_policy",
      });
      await logSystemEvent({
        level: "info",
        source: "customer_sms_skipped",
        message: "email_confirmed_ok — SMS skipped (email-first policy)",
        context: { bookingId: event.bookingId, preferred_channel: preferredNotificationChannel },
      });
    }

    // DO NOT notify cleaner on payment — SMS-only flow uses dispatch offer SMS + assigned SMS only.

    const payFields = buildBookingNotifyMessageFields({
      bookingId: event.bookingId,
      service: payload.serviceLabel,
      date: payload.dateLabel,
      time: payload.timeLabel,
      location: payload.location,
    });
    await sendAdminIfConfigured(
      "payment_confirmed",
      { bookingId: event.bookingId },
      async () => {
        const claimedAdminEmail = await tryClaimNotificationIdempotency(supabase, {
          reference: event.paymentReference,
          eventType: "payment_confirmed_admin",
          channel: "email",
          bookingId: event.bookingId,
        });
        if (!claimedAdminEmail) return;
        const adminAssignmentNote =
          payload.showCleanerSubstitutionNotice && payload.fallbackReason
            ? `<p style="font-family:system-ui,sans-serif;font-size:14px;color:#92400e"><strong>Checkout assignment:</strong> auto_fallback — ${escapeHtml(payload.fallbackReason)}</p>`
            : payload.showCleanerSubstitutionNotice
              ? `<p style="font-family:system-ui,sans-serif;font-size:14px;color:#92400e"><strong>Checkout assignment:</strong> auto_fallback</p>`
              : "";
        const adminHtml = `<h2 style="font-family:system-ui">Payment confirmed</h2>${adminAssignmentNote}${adminBaseBlock({
          bookingId: payFields.id,
          service: payFields.service,
          date: payFields.date,
          time: payFields.time,
          location: payFields.address,
          customerEmail: payload.customerEmail,
          paystackRef: event.paymentReference,
        })}`;
        await sendAdminHtmlEmail({
          subject: `[PAYMENT_CONFIRMED] ${payload.serviceLabel} — ${event.bookingId.slice(0, 8)}…`,
          html: adminHtml,
          context: { bookingId: event.bookingId, type: "payment_confirmed" },
        });
      },
    );

    const uid = head ? String(head.user_id ?? "").trim() : "";
    if (uid) {
      const claimedInApp = await tryClaimNotificationIdempotency(supabase, {
        reference: event.paymentReference,
        eventType: "payment_confirmed",
        channel: "in_app",
        bookingId: event.bookingId,
      });
      if (claimedInApp) {
        try {
          const locked = event.snapshot?.locked;
          await notifyCustomerBookingPlaced(supabase, {
            bookingId: event.bookingId,
            userId: uid,
            serviceLabel: locked?.service != null ? getServiceLabel(locked.service) : payload.serviceLabel,
            dateYmd: locked?.date ?? null,
            timeHm: locked?.time ?? null,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[IN_APP NOTIFY FAILED]", { bookingId: event.bookingId, err });
          await enqueueNotificationDeliveryFailure({
            bookingId: event.bookingId,
            eventType: "payment_confirmed",
            channel: "in_app",
            error: msg,
          });
        }
      }
    }

    notifyBookingDebug("payment_confirmed_pipeline_done", {
      bookingId: event.bookingId,
      paymentReference: event.paymentReference,
      hasEmail,
      hasPhone: Boolean(custPhone),
      emailClaimed: debugEmailClaimed,
      emailSent: cust.sent,
      emailError: cust.error ?? null,
      smsClaimed: debugSmsClaimed,
      customerSmsOk: debugCustomerSmsOk,
    });
    return;
  }

  if (event.type === "assigned") {
    const assignedClaimed = await tryClaimNotificationDedupe(supabase, "assigned_sent", {
      bookingId: event.bookingId,
      cleanerId: event.cleanerId,
    });
    if (!assignedClaimed) return;

    await notifyCustomerCleanerAssigned(supabase, event.bookingId);

    const { data: b } = await supabase
      .from("bookings")
      .select(
        "id, paystack_reference, customer_email, customer_name, customer_phone, user_id, service, date, time, location, booking_snapshot, amount_paid_cents, total_paid_zar, cleaner_id, is_team_job, display_earnings_cents, cleaner_payout_cents, status, created_at",
      )
      .eq("id", event.bookingId)
      .maybeSingle();

    if (!b || typeof b !== "object") return;

    const snap = (b as { booking_snapshot?: unknown }).booking_snapshot as BookingSnapshotV1 | null;
    const ref = String((b as { paystack_reference?: string }).paystack_reference ?? event.bookingId);
    const cents = Number((b as { amount_paid_cents?: number }).amount_paid_cents ?? 0);
    const emailRaw = String((b as { customer_email?: string | null }).customer_email ?? "").trim();
    const { data: cRow } = await supabase
      .from("cleaners")
      .select("full_name, phone_number, email")
      .eq("id", event.cleanerId)
      .maybeSingle();
    const cleanerName =
      cRow && typeof cRow === "object"
        ? String((cRow as { full_name?: string | null }).full_name ?? "").trim() || null
        : null;
    if (emailRaw) {
      const payload = buildBookingEmailPayload({
        paymentReference: ref,
        amountCents: cents,
        customerEmail: emailRaw,
        snapshot: snap,
        bookingId: event.bookingId,
      });
      const assignPayload: BookingEmailPayload = { ...payload, cleanerName };
      const r = await sendCustomerBookingAssignedEmail(assignPayload);
      if (!r.sent && r.error) {
        await reportOperationalIssue("warn", "notifyBookingEvent/assigned/customer_email", r.error, {
          bookingId: event.bookingId,
        });
      }
      await logPipelineEmailTelemetry({
        role: "customer",
        channel: "booking_assigned",
        sent: r.sent,
        error: r.error,
        bookingId: event.bookingId,
      });
    }

    const msgFields = buildBookingNotifyMessageFields({
      bookingId: event.bookingId,
      service: (b as { service?: string | null }).service,
      date: (b as { date?: string | null }).date,
      time: (b as { time?: string | null }).time,
      location: (b as { location?: string | null }).location,
    });

    const payResolved = resolveDisplayEarnings({
      id: event.bookingId,
      is_team_job: (b as { is_team_job?: boolean | null }).is_team_job === true,
      display_earnings_cents:
        typeof (b as { display_earnings_cents?: unknown }).display_earnings_cents === "number"
          ? (b as { display_earnings_cents: number }).display_earnings_cents
          : null,
      cleaner_payout_cents:
        typeof (b as { cleaner_payout_cents?: unknown }).cleaner_payout_cents === "number"
          ? (b as { cleaner_payout_cents: number }).cleaner_payout_cents
          : null,
    });
    const cleanerPayZar =
      payResolved.cents != null && Number.isFinite(payResolved.cents) ? Math.round(payResolved.cents / 100) : null;

    await sendAdminIfConfigured(
      "assigned",
      { bookingId: event.bookingId, cleanerId: event.cleanerId },
      async () => {
        await sendAdminHtmlEmail({
          subject: `[ASSIGNED] ${msgFields.service} — ${event.bookingId.slice(0, 8)}…`,
          html: `<h2>Cleaner assigned</h2>${adminBaseBlock({
            bookingId: msgFields.id,
            service: msgFields.service,
            date: msgFields.date,
            time: msgFields.time,
            location: msgFields.address,
            customerEmail: emailRaw || undefined,
            paystackRef: ref !== event.bookingId ? ref : undefined,
          })}<p>Cleaner ID: <code>${escapeHtml(event.cleanerId)}</code></p>`,
          context: { bookingId: event.bookingId, cleanerId: event.cleanerId, type: "assigned" },
        });
      },
    );

    const cleanerPhoneRaw =
      cRow && typeof cRow === "object" ? String((cRow as { phone_number?: string | null }).phone_number ?? "").trim() : "";
    const name = cleanerName || "Cleaner";

    if (!cleanerPhoneRaw) {
      console.warn("[CLEANER SMS INVALID PHONE]", { bookingId: event.bookingId, raw: "" });
      await logSystemEvent({
        level: "warn",
        source: "notifyBookingEvent/assigned",
        message: "No cleaner phone for assignment SMS",
        context: { bookingId: event.bookingId, cleanerId: event.cleanerId },
      });
    } else {
      const e164 = customerPhoneToE164(cleanerPhoneRaw);
      if (!e164) {
        console.warn("[CLEANER SMS INVALID PHONE]", cleanerPhoneRaw);
        await logSystemEvent({
          level: "warn",
          source: "notifyBookingEvent/assigned",
          message: "Cleaner phone not normalizable to E.164 for assignment SMS",
          context: { bookingId: event.bookingId, cleanerId: event.cleanerId },
        });
      } else {
        const assignedSmsIdemRef = `assigned_sms:v1:${event.bookingId}:${event.cleanerId}`;
        const assignedSmsClaimed = await tryClaimNotificationIdempotency(supabase, {
          reference: assignedSmsIdemRef,
          eventType: "assigned",
          channel: "sms",
          bookingId: event.bookingId,
        });
        if (!assignedSmsClaimed) {
          console.log("[ASSIGNED SMS SKIPPED — IDEMPOTENT]", { bookingId: event.bookingId, cleanerId: event.cleanerId });
        } else {
          const smsBody = formatBookingNotifyPlainLines(msgFields, {
            headline: "Shalean: Job assigned to you",
            footerLines: ["Open your app for details."],
          }).slice(0, 1200);
          const smsRes = await sendSmsFallback({
            toE164: e164,
            body: smsBody,
            context: { bookingId: event.bookingId, cleanerId: event.cleanerId },
            smsRole: "primary",
            recipientKind: "cleaner",
            deliveryLog: {
              templateKey: "cleaner_assignment_sms_direct",
              bookingId: event.bookingId,
              eventType: "assigned",
              role: "cleaner",
            },
          });
          console.log("[ASSIGNED SMS RESULT]", smsRes);
          if (!smsRes.sent && smsRes.error) {
            await enqueueNotificationDeliveryFailure({
              bookingId: event.bookingId,
              eventType: "assigned",
              channel: "sms",
              error: smsRes.error,
            });
          }
        }
      }
    }

    if (process.env.CLEANER_ASSIGNED_SEND_EMAIL_FALLBACK === "true") {
      const em =
        cRow && typeof cRow === "object" ? String((cRow as { email?: string | null }).email ?? "").trim() : "";
      if (em) {
        await sendCleanerNewJobEmail({
          cleanerEmail: em,
          cleanerName: name,
          bookingId: event.bookingId,
          service: msgFields.service,
          dateLabel: msgFields.date,
          timeLabel: msgFields.time,
          location: msgFields.address,
          earningsZar: cleanerPayZar,
          earningsIsEstimate: payResolved.isEstimate,
        });
      }
    }
    return;
  }

  if (event.type === "completed") {
    const completedClaimed = await tryClaimNotificationDedupe(supabase, "completed_sent", {
      bookingId: event.bookingId,
    });
    if (!completedClaimed) return;

    const { data: b } = await supabase
      .from("bookings")
      .select(
        "id, paystack_reference, customer_email, customer_name, customer_phone, service, date, time, location, booking_snapshot, amount_paid_cents, cleaner_id",
      )
      .eq("id", event.bookingId)
      .maybeSingle();
    if (!b || typeof b !== "object") return;
    const email = String((b as { customer_email?: string | null }).customer_email ?? "").trim();
    if (!email) {
      await logSystemEvent({
        level: "warn",
        source: "missing_customer_email",
        message: "No customer_email on booking for completed notification — customer email skipped",
        context: { bookingId: event.bookingId, stage: "completed" },
      });
    }
    const snap = (b as { booking_snapshot?: unknown }).booking_snapshot as BookingSnapshotV1 | null;
    const ref = String((b as { paystack_reference?: string }).paystack_reference ?? event.bookingId);
    const cents = Number((b as { amount_paid_cents?: number }).amount_paid_cents ?? 0);
    const service = String((b as { service?: string | null }).service ?? "Cleaning");
    let dateLabel = "—";
    const d = String((b as { date?: string | null }).date ?? "");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, da] = d.split("-").map(Number);
      dateLabel = new Date(y, m - 1, da).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "short" });
    }
    if (email) {
      const payload = buildBookingEmailPayload({
        paymentReference: ref,
        amountCents: cents,
        customerEmail: email,
        snapshot: snap,
        bookingId: event.bookingId,
      });
      const r = await sendCustomerJobCompletedEmail(payload);
      if (!r.sent && r.error) {
        await reportOperationalIssue("warn", "notifyBookingEvent/completed/customer", r.error, {
          bookingId: event.bookingId,
        });
      }
      await logPipelineEmailTelemetry({
        role: "customer",
        channel: "job_completed",
        sent: r.sent,
        error: r.error,
        bookingId: event.bookingId,
      });
    }

    const cleanerIdCompleted = String((b as { cleaner_id?: string | null }).cleaner_id ?? "").trim();
    const phoneRawCompleted = String((b as { customer_phone?: string | null }).customer_phone ?? "").trim();
    if (cleanerIdCompleted && phoneRawCompleted) {
      const { data: existingReview } = await supabase
        .from("reviews")
        .select("id")
        .eq("booking_id", event.bookingId)
        .maybeSingle();
      if (!existingReview) {
        await enqueueReviewSmsPromptQueue(supabase, event.bookingId);
      }
    }

    const doneFields = buildBookingNotifyMessageFields({
      bookingId: event.bookingId,
      service: (b as { service?: string | null }).service,
      date: (b as { date?: string | null }).date,
      time: (b as { time?: string | null }).time,
      location: (b as { location?: string | null }).location,
    });
    await sendAdminIfConfigured("completed", { bookingId: event.bookingId }, async () => {
      await sendAdminHtmlEmail({
        subject: `[COMPLETED] ${service} — ${event.bookingId.slice(0, 8)}…`,
        html: `<h2>Booking completed</h2>${adminBaseBlock({
          bookingId: doneFields.id,
          service: doneFields.service,
          date: doneFields.date,
          time: doneFields.time,
          location: doneFields.address,
          customerEmail: email || undefined,
          paystackRef: ref !== event.bookingId ? ref : undefined,
        })}`,
        context: { bookingId: event.bookingId, type: "completed" },
      });
    });
    return;
  }

  if (event.type === "cancelled") {
    const em = event.customerEmail.trim() ? normalizeEmail(event.customerEmail) : "";
    if (em.length > 3) {
      const r = await sendCustomerBookingCancelledEmail({
        customerEmail: em,
        serviceLabel: event.serviceLabel ?? "Cleaning",
        dateYmd: event.dateYmd,
        timeHm: event.timeHm,
        bookingId: event.bookingId,
      });
      if (!r.sent && r.error) {
        await reportOperationalIssue("warn", "notifyBookingEvent/cancelled/customer_email", r.error, {
          bookingId: event.bookingId,
        });
      }
      await logPipelineEmailTelemetry({
        role: "customer",
        channel: "booking_cancelled",
        sent: r.sent,
        error: r.error,
        bookingId: event.bookingId,
      });
    }
    await sendAdminIfConfigured("cancelled", { bookingId: event.bookingId }, async () => {
      await sendAdminHtmlEmail({
        subject: `[CANCELLED] ${event.serviceLabel ?? "Booking"} — ${event.bookingId.slice(0, 8)}…`,
        html: `<h2>Booking cancelled</h2>${adminBaseBlock({
          bookingId: event.bookingId,
          service: event.serviceLabel ?? "Cleaning",
          date: event.dateYmd ?? "—",
          time: event.timeHm ?? "—",
          location: "—",
          customerEmail: em || undefined,
        })}`,
        context: { bookingId: event.bookingId, type: "cancelled" },
      });
    });
    return;
  }

  if (event.type === "rescheduled") {
    const em = event.customerEmail.trim() ? normalizeEmail(event.customerEmail) : "";
    if (em.length > 3) {
      const r = await sendCustomerRescheduledEmail({
        customerEmail: em,
        bookingId: event.bookingId,
        serviceLabel: event.serviceLabel ?? "Cleaning",
        previousDate: event.previousDate,
        previousTime: event.previousTime,
        newDate: event.newDate,
        newTime: event.newTime,
      });
      if (!r.sent && r.error) {
        await reportOperationalIssue("warn", "notifyBookingEvent/rescheduled/customer", r.error, { bookingId: event.bookingId });
      }
      await logPipelineEmailTelemetry({
        role: "customer",
        channel: "booking_rescheduled",
        sent: r.sent,
        error: r.error,
        bookingId: event.bookingId,
      });
    }
    await sendAdminIfConfigured("rescheduled", { bookingId: event.bookingId }, async () => {
      await sendAdminHtmlEmail({
        subject: `[RESCHEDULED] ${event.serviceLabel ?? "Booking"} — ${event.bookingId.slice(0, 8)}…`,
        html: `<h2>Booking rescheduled</h2>
        <p><strong>Booking ID:</strong> <code>${escapeHtml(event.bookingId)}</code></p>
        <p><strong>Was:</strong> ${escapeHtml(event.previousDate)} ${escapeHtml(event.previousTime)}</p>
        <p><strong>Now:</strong> ${escapeHtml(event.newDate)} ${escapeHtml(event.newTime)}</p>`,
        context: { bookingId: event.bookingId, type: "rescheduled" },
      });
    });
    return;
  }

  if (event.type === "sla_breach") {
    if (!event.bookingIds.length) return;
    const freshIds: string[] = [];
    for (const id of event.bookingIds.slice(0, 50)) {
      const claimed = await tryClaimNotificationDedupe(supabase, "sla_breach_sent", { bookingId: id });
      if (claimed) freshIds.push(id);
    }
    if (!freshIds.length) return;

    const lines: string[] = [];
    for (const id of freshIds.slice(0, 40)) {
      const { data: row } = await supabase
        .from("bookings")
        .select("id, service, date, time, location, customer_email, paystack_reference")
        .eq("id", id)
        .maybeSingle();
      if (!row || typeof row !== "object") continue;
      lines.push(
        `<li><code>${escapeHtml(id)}</code> — ${escapeHtml(String((row as { service?: string }).service ?? ""))} — ${escapeHtml(String((row as { date?: string }).date ?? ""))} ${escapeHtml(String((row as { time?: string }).time ?? ""))} — ${escapeHtml(String((row as { customer_email?: string }).customer_email ?? ""))}</li>`,
      );
    }
    await sendAdminIfConfigured(
      "sla_breach",
      { bookingIds: freshIds },
      async () => {
        await sendAdminHtmlEmail({
          subject: `[SLA_BREACH] ${freshIds.length} booking(s) past ${event.minutes}m`,
          html: `<h2>Dispatch SLA breach</h2><p>Pending without cleaner past <strong>${event.minutes}</strong> minutes.</p><ul>${lines.join("")}</ul>`,
          context: { bookingIds: freshIds, type: "sla_breach" },
        });
      },
    );
    return;
  }

  if (event.type === "reminder_2h") {
    const reminderClaimed = await tryClaimNotificationDedupe(supabase, "reminder_2h_sent", {
      bookingId: event.bookingId,
    });
    if (!reminderClaimed) return;

    const { data: b } = await supabase
      .from("bookings")
      .select("id, customer_email, service, date, time, location, cleaner_id")
      .eq("id", event.bookingId)
      .maybeSingle();
    if (!b || typeof b !== "object") return;
    const email = String((b as { customer_email?: string | null }).customer_email ?? "").trim();
    if (!email && event.includeCustomerEmail) {
      await logSystemEvent({
        level: "warn",
        source: "missing_customer_email",
        message: "No customer_email for reminder_2h email",
        context: { bookingId: event.bookingId, stage: "reminder_2h" },
      });
    }
    const service = String((b as { service?: string | null }).service ?? "Cleaning");
    const date = String((b as { date?: string | null }).date ?? "");
    const time = String((b as { time?: string | null }).time ?? "");
    const location = String((b as { location?: string | null }).location ?? "");
    let dateLabel = date;
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [y, m, da] = date.split("-").map(Number);
      dateLabel = new Date(y, m - 1, da).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "short" });
    }
    if (event.includeCustomerEmail && email) {
      const r = await sendCustomerTwoHourReminderEmail({
        customerEmail: email,
        serviceLabel: service,
        dateLabel,
        timeLabel: time,
        location,
        bookingId: event.bookingId,
      });
      if (!r.sent && r.error) {
        await reportOperationalIssue("warn", "notifyBookingEvent/reminder_2h/email", r.error, { bookingId: event.bookingId });
      }
      await logPipelineEmailTelemetry({
        role: "customer",
        channel: "reminder_2h",
        sent: r.sent,
        error: r.error,
        bookingId: event.bookingId,
      });
    }
    const cleanerId = String((b as { cleaner_id?: string | null }).cleaner_id ?? "").trim();
    if (cleanerId) {
      const { data: c } = await supabase.from("cleaners").select("phone_number").eq("id", cleanerId).maybeSingle();
      const phone = c && typeof c === "object" ? String((c as { phone_number?: string | null }).phone_number ?? "") : "";
      const remFields = buildBookingNotifyMessageFields({
        bookingId: event.bookingId,
        service,
        date,
        time,
        location,
      });
      const msg = formatBookingNotifyPlainLines(remFields, { headline: "⏰ Reminder: cleaning job soon" });
      const e164 = customerPhoneToE164(phone);
      if (!e164) {
        await logSystemEvent({
          level: "warn",
          source: "notifyBookingEvent/reminder_2h",
          message: "No usable cleaner phone for reminder SMS",
          context: { bookingId: event.bookingId, cleanerId },
        });
      } else {
        const reminderSmsRef = `reminder_2h_sms:v1:${event.bookingId}:${cleanerId}`;
        const reminderSmsClaimed = await tryClaimNotificationIdempotency(supabase, {
          reference: reminderSmsRef,
          eventType: "reminder_2h",
          channel: "sms",
          bookingId: event.bookingId,
        });
        if (!reminderSmsClaimed) {
          console.log("[REMINDER_2H SMS SKIPPED — IDEMPOTENT]", { bookingId: event.bookingId, cleanerId });
        } else {
          const smsRes = await sendSmsFallback({
            toE164: e164,
            body: msg.slice(0, 1200),
            context: { bookingId: event.bookingId, cleanerId },
            smsRole: "primary",
            recipientKind: "cleaner",
            deliveryLog: {
              templateKey: "cleaner_reminder_2h_sms_direct",
              bookingId: event.bookingId,
              eventType: "reminder_2h",
              role: "cleaner",
            },
          });
          console.log("[REMINDER_2H SMS RESULT]", smsRes);
        }
      }
    }
  }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[notifyBookingEvent] unhandled failure", msg);
    await reportOperationalIssue("error", "notifyBookingEvent/unhandled", msg, {
      eventType: event.type,
      bookingId: "bookingId" in event ? (event as { bookingId?: string }).bookingId : undefined,
    });
  }
}
