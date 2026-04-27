import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceLabel } from "@/components/booking/serviceCategories";
import {
  type CreatedBookingRecord,
  sendCleanerJobAssignedWhatsApp,
  sendCleanerJobReminderWhatsApp,
} from "@/lib/booking/cleanerJobAssignedWhatsApp";
import { sendCleanerNewJobEmail } from "@/lib/email/sendCleanerNotification";
import {
  buildBookingNotifyMessageFields,
  buildCleanerAssignedNotifyHeadline,
  formatBookingNotifyPlainLines,
  notifyAreaShortForHeadline,
} from "@/lib/notifications/bookingNotifyFormat";
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
import { parseTrimmedBookingId } from "@/lib/booking/bookingIds";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import {
  notifyCustomerBookingPlaced,
  notifyCustomerCleanerAssigned,
} from "@/lib/notifications/customerUserNotifications";
import { logPipelineEmailTelemetry } from "@/lib/notifications/notificationEmailTelemetry";
import { tryClaimNotificationDedupe } from "@/lib/notifications/notificationDedupe";
import { applyFallbackDelayIfNeeded } from "@/lib/ai-autonomy/optimizeTiming";
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

function assertCriticalAdminNotificationEmailEnv(): void {
  if (!process.env.ADMIN_NOTIFICATION_EMAIL?.trim()) {
    throw new Error("CRITICAL: ADMIN_NOTIFICATION_EMAIL not set");
  }
}

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
  assertCriticalAdminNotificationEmailEnv();
  try {
    await send();
  } catch (e) {
    await reportOperationalIssue("error", `notifyBookingEvent/${adminType}/admin`, String(e), context);
  }
}

/**
 * Ensures `bookingId` when only `bookingIds[0]` was provided (timeline + alert rep picker).
 * Non-string or whitespace-only `bookingId` is treated as missing for fallback; frozen object only when mutating.
 */
function withBookingIdOnNotificationContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const bid = parseTrimmedBookingId(ctx.bookingId);
  if (bid) {
    if (ctx.bookingId === bid) return ctx;
    return Object.freeze({ ...ctx, bookingId: bid });
  }

  if (Array.isArray(ctx.bookingIds)) {
    const candidate = parseTrimmedBookingId(ctx.bookingIds[0]);
    if (candidate) {
      return Object.freeze({
        ...ctx,
        bookingId: candidate,
        bookingIdSource: "bookingIds_fallback",
      });
    }
  }

  if (typeof ctx.bookingId === "string" && !bid) {
    const { bookingId: _omit, ...rest } = ctx;
    return Object.freeze(rest);
  }
  return ctx;
}

/** Prefer wall time from `eventTriggeredAtIso` so slow logs match pipeline semantics if callers pass both. */
function pipelineLatencyMsForSlowLog(context: Record<string, unknown>): number {
  const triggered = context.eventTriggeredAtIso;
  if (typeof triggered === "string" && triggered.trim()) {
    const t0 = new Date(triggered).getTime();
    if (Number.isFinite(t0)) return Date.now() - t0;
  }
  const raw = context.pipelineLatencyMs;
  return typeof raw === "number" ? raw : Number(raw);
}

async function reportSlowNotificationIfNeeded(context: Record<string, unknown>): Promise<void> {
  const ctx = withBookingIdOnNotificationContext(context);
  const ms = pipelineLatencyMsForSlowLog(ctx);
  if (!Number.isFinite(ms) || ms <= 5000) return;
  const rounded = Math.round(ms);
  const out = Object.freeze({ ...ctx, pipelineLatencyMs: rounded });
  await reportOperationalIssue("warn", "slow_notification", `Cleaner pipeline latency ${rounded}ms (>5000ms)`, out);
  await logSystemEvent({
    level: "warn",
    source: "slow_notification",
    message: `Cleaner notification pipeline exceeded 5000ms (${rounded}ms)`,
    context: out,
  });
}

async function logCleanerWhatsAppFailed(context: Record<string, unknown>, reason: string): Promise<void> {
  await logSystemEvent({
    level: "warn",
    source: "cleaner_whatsapp_failed",
    message: reason.slice(0, 2000),
    context,
  });
  await reportSlowNotificationIfNeeded(context);
}

async function logCleanerSmsFallbackUsed(context: Record<string, unknown>): Promise<void> {
  await logSystemEvent({
    level: "info",
    source: "cleaner_sms_fallback_used",
    message: "SMS fallback sent after WhatsApp did not succeed",
    context,
  });
  await reportSlowNotificationIfNeeded(context);
}

async function logCleanerWhatsAppSent(context: Record<string, unknown>): Promise<void> {
  await logSystemEvent({
    level: "info",
    source: "cleaner_whatsapp_sent",
    message: "WhatsApp message accepted by outbound pipeline",
    context,
  });
  await reportSlowNotificationIfNeeded(context);
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

/**
 * Central orchestration for booking lifecycle notifications (customer email + in-app, cleaner WhatsApp + SMS fallback, admin email).
 * Admin mail: requires `ADMIN_NOTIFICATION_EMAIL` when an admin notification is sent — missing env throws `CRITICAL: ADMIN_NOTIFICATION_EMAIL not set`.
 * Optional `ADMIN_NOTIFICATION_LEVEL=critical` limits admin mail to payment_confirmed, sla_breach, and cancelled.
 *
 * Channel fallbacks are documented in `notificationChannelRules.ts` (cleaner: WhatsApp → SMS; customer payment_confirmed: email first, SMS only if email missing or failed; no customer WhatsApp).
 *
 * Idempotency: `reminder_2h_sent`, `assigned_sent`, `completed_sent`, `sla_breach_sent` claims use migration
 * `20260493_system_logs_notification_dedupe_idx.sql` (claim-first insert). Future: cleaner read receipts / opened tracking.
 */
export async function notifyBookingEvent(event: NotifyBookingEventInput): Promise<void> {
  const { supabase } = event;

  if (event.type === "payment_confirmed") {
    const hasEmail = Boolean(event.customerEmail.trim());
    const custPhone = event.snapshot?.customer?.phone?.trim();

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
    const { data: bookingHead } = await supabase
      .from("bookings")
      .select("user_id, assignment_type, fallback_reason")
      .eq("id", event.bookingId)
      .maybeSingle();
    const head =
      bookingHead && typeof bookingHead === "object" ? (bookingHead as Record<string, unknown>) : null;
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
      customerEmail: event.customerEmail,
      snapshot: event.snapshot,
      bookingId: event.bookingId,
      assignmentType,
      fallbackReason,
    });
    let cust: { sent: boolean; error?: string } = { sent: false };
    if (hasEmail) {
      cust = await sendBookingConfirmationEmail(payload);
      if (!cust.sent && cust.error) {
        await reportOperationalIssue("error", "notifyBookingEvent/payment_confirmed", cust.error, {
          bookingId: event.bookingId,
        });
      }
      await logPipelineEmailTelemetry({
        role: "customer",
        channel: "payment_confirmation",
        sent: cust.sent,
        error: cust.error,
        bookingId: event.bookingId,
      });
    }

    const emailSent = hasEmail && cust.sent;
    if (custPhone && (!hasEmail || !cust.sent)) {
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
      await applyFallbackDelayIfNeeded(supabase, {
        userId: payUserId || null,
        bookingId: event.bookingId,
        priceHint: event.amountCents / 100,
        flow: "payment",
      });
      await sendCustomerSmsFromTemplate({
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
    } else if (custPhone && emailSent) {
      await logSystemEvent({
        level: "info",
        source: "customer_sms_skipped",
        message: "email_confirmed_ok — SMS skipped (email-first policy)",
        context: { bookingId: event.bookingId, preferred_channel: preferredNotificationChannel },
      });
    }

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
      const locked = event.snapshot?.locked;
      await notifyCustomerBookingPlaced(supabase, {
        bookingId: event.bookingId,
        userId: uid,
        serviceLabel: locked?.service != null ? getServiceLabel(locked.service) : payload.serviceLabel,
        dateYmd: locked?.date ?? null,
        timeHm: locked?.time ?? null,
      });
    }
    return;
  }

  if (event.type === "assigned") {
    const assignedClaimed = await tryClaimNotificationDedupe(supabase, "assigned_sent", {
      bookingId: event.bookingId,
      cleanerId: event.cleanerId,
    });
    if (!assignedClaimed) return;

    const assignedEventTriggeredAtIso = new Date().toISOString();
    const assignedPipelineT0Ms = Date.now();
    const assignedDeliveryCtx = (extra: Record<string, unknown>) => ({
      ...extra,
      bookingId: event.bookingId,
      cleanerId: event.cleanerId,
      eventTriggeredAtIso: assignedEventTriggeredAtIso,
      pipelineLatencyMs: Date.now() - assignedPipelineT0Ms,
    });

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

    const payResolved = resolveDisplayEarnings(
      {
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
      },
      "notifyBookingEvent/assigned",
    );
    const cleanerPayZar =
      payResolved.cents != null && Number.isFinite(payResolved.cents) ? Math.round(payResolved.cents / 100) : null;
    const assignedHeadline = buildCleanerAssignedNotifyHeadline(cleanerPayZar, payResolved.isEstimate, {
      service: msgFields.service,
      areaShort: notifyAreaShortForHeadline(msgFields.address),
    });

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
    const msg = `${formatBookingNotifyPlainLines(msgFields, {
      headline: assignedHeadline,
      footerLines: ["", "Open the Shalean cleaner app for details."],
    })}`;

    const bookingRow = b as {
      id: string;
      customer_name?: string | null;
      customer_phone?: string | null;
      location?: string | null;
      service?: string | null;
      date?: string | null;
      time?: string | null;
      status?: string | null;
      created_at?: string | null;
    };
    const bookingRecord: CreatedBookingRecord = {
      id: bookingRow.id,
      customer_name: bookingRow.customer_name ?? null,
      customer_phone: bookingRow.customer_phone ?? null,
      location: bookingRow.location ?? null,
      service: bookingRow.service ?? null,
      date: bookingRow.date ?? null,
      time: bookingRow.time ?? null,
      status: bookingRow.status ?? null,
      created_at: bookingRow.created_at?.trim() ? bookingRow.created_at.trim() : new Date().toISOString(),
    };

    if (!cleanerPhoneRaw) {
      await logCleanerWhatsAppFailed(
        assignedDeliveryCtx({
          channel: "whatsapp_job_assigned",
        }),
        "missing_phone",
      );
      await logSystemEvent({
        level: "warn",
        source: "notifyBookingEvent/assigned",
        message: "No cleaner phone for WhatsApp/SMS",
        context: assignedDeliveryCtx({}),
      });
    } else {
      const cleanerFullNameForLog =
        cRow && typeof cRow === "object"
          ? String((cRow as { full_name?: string | null }).full_name ?? "").trim()
          : "";
      const waRes = await sendCleanerJobAssignedWhatsApp(bookingRecord, {
        recipientPhone: cleanerPhoneRaw,
        cleanerDisplayName: cleanerName ?? undefined,
        cleanerId: event.cleanerId,
      });
      if (waRes.ok) {
        await logCleanerWhatsAppSent(
          assignedDeliveryCtx({
            channel: "whatsapp_job_assigned",
          }),
        );
      } else {
        await logCleanerWhatsAppFailed(
          assignedDeliveryCtx({
            channel: "whatsapp_job_assigned",
            reason: "sendCleanerJobAssignedWhatsApp_failed",
          }),
          waRes.error ?? "WhatsApp send did not complete successfully",
        );
        const e164 = customerPhoneToE164(cleanerPhoneRaw);
        if (e164) {
          const smsRes = await sendSmsFallback({
            toE164: e164,
            body: msg.slice(0, 1200),
            context: { bookingId: event.bookingId, cleanerId: event.cleanerId },
            smsRole: "fallback",
            recipientKind: "cleaner",
            deliveryLog: {
              templateKey: "cleaner_assignment_sms_direct",
              bookingId: event.bookingId,
              eventType: "assigned",
              role: "cleaner",
            },
          });
          if (smsRes.sent) {
            await logCleanerSmsFallbackUsed(
              assignedDeliveryCtx({
                channel: "whatsapp_job_assigned",
              }),
            );
          }
        } else {
          await logSystemEvent({
            level: "warn",
            source: "notifyBookingEvent/assigned",
            message: "No cleaner phone for WhatsApp/SMS",
            context: assignedDeliveryCtx({}),
          });
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
      .select("id, paystack_reference, customer_email, service, date, time, location, booking_snapshot, amount_paid_cents")
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

    const reminderEventTriggeredAtIso = new Date().toISOString();
    const reminderPipelineT0Ms = Date.now();

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
      const reminderDeliveryCtx = (extra: Record<string, unknown>) => ({
        ...extra,
        bookingId: event.bookingId,
        cleanerId,
        eventTriggeredAtIso: reminderEventTriggeredAtIso,
        pipelineLatencyMs: Date.now() - reminderPipelineT0Ms,
      });
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
      const wa = await sendCleanerJobReminderWhatsApp({
        phone,
        bookingId: event.bookingId,
        cleanerId,
        location: remFields.address,
        timeForCleaner: remFields.time,
      });
      if (wa.ok) {
        await logCleanerWhatsAppSent(
          reminderDeliveryCtx({
            channel: "whatsapp_job_reminder_2h",
          }),
        );
      } else {
        await logCleanerWhatsAppFailed(
          reminderDeliveryCtx({
            channel: "whatsapp_job_reminder_2h",
            reason: wa.error ?? "unknown",
          }),
          wa.error ?? "WhatsApp send did not succeed",
        );
        const e164 = customerPhoneToE164(phone);
        if (e164) {
          const smsRes = await sendSmsFallback({
            toE164: e164,
            body: msg.slice(0, 1200),
            context: { bookingId: event.bookingId, cleanerId },
            smsRole: "fallback",
            recipientKind: "cleaner",
            deliveryLog: {
              templateKey: "cleaner_reminder_2h_sms_direct",
              bookingId: event.bookingId,
              eventType: "reminder_2h",
              role: "cleaner",
            },
          });
          if (smsRes.sent) {
            await logCleanerSmsFallbackUsed(
              reminderDeliveryCtx({
                channel: "whatsapp_job_reminder_2h",
              }),
            );
          }
        }
      }
    }
  }
}
