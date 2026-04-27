import { getServiceLabel } from "@/components/booking/serviceCategories";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { getDefaultFromAddress, getResend } from "@/lib/email/resendFrom";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { logPipelineEmailTelemetry } from "@/lib/notifications/notificationEmailTelemetry";
import { writeNotificationLog } from "@/lib/notifications/notificationLogWrite";
import { getVariableAllowlistFromRow, renderTemplate } from "@/lib/templates/render";
import { getTemplate } from "@/lib/templates/store";

export type BookingEmailPayload = {
  customerEmail: string;
  /** From snapshot when available — used for email greeting. */
  customerName?: string | null;
  serviceLabel: string;
  dateLabel: string;
  timeLabel: string;
  location: string;
  cleanerName: string | null;
  totalPaidZar: number;
  paymentReference: string;
  /** DB booking id for links / admin copy (optional). */
  bookingId?: string | null;
  /** True when checkout cleaner choice was not honored and another cleaner was assigned. */
  showCleanerSubstitutionNotice?: boolean;
  /** Machine-readable reason when substitution applies (e.g. invalid_cleaner_id). */
  fallbackReason?: string | null;
};

export { getDefaultFromAddress };

/** String fields for `booking_confirmed` templates (email / WhatsApp / SMS). */
function bookingIdForNotificationLog(payload: BookingEmailPayload): string | null {
  const b = payload.bookingId?.trim();
  return b || null;
}

const CUSTOMER_PAYMENT_EVENT = "payment_confirmed";
const CUSTOMER_PAYMENT_STEP = "payment_confirmed";

function customerPaymentPayload(extra: Record<string, unknown>): Record<string, unknown> {
  return { ...extra, step: CUSTOMER_PAYMENT_STEP };
}

export function buildBookingConfirmedTemplateData(payload: BookingEmailPayload): Record<string, string> {
  const price = `R ${payload.totalPaidZar.toLocaleString("en-ZA")}`;
  const bookingId = (payload.bookingId?.trim() || payload.paymentReference).trim();
  const emailLocal = payload.customerEmail.includes("@")
    ? payload.customerEmail.split("@")[0]?.replace(/[.+_]/g, " ").trim() ?? ""
    : payload.customerEmail.trim();
  const customerName = (payload.customerName?.trim() || emailLocal || "there").slice(0, 120);
  return {
    customer_name: customerName,
    date: payload.dateLabel,
    time: payload.timeLabel,
    price,
    booking_id: bookingId,
    service: payload.serviceLabel,
    location: (payload.location?.trim() || "—").slice(0, 500),
  };
}

type DbTemplateAttempt = { usedRow: false } | { usedRow: true; sent: boolean; error?: string };

async function sendBookingConfirmationFromDbTemplateIfConfigured(payload: BookingEmailPayload): Promise<DbTemplateAttempt> {
  const template = await getTemplate("booking_confirmed", "email");
  if (!template) return { usedRow: false };

  const resend = getResend();
  const bid = bookingIdForNotificationLog(payload);
  if (!resend) {
    await reportOperationalIssue("warn", "sendBookingConfirmationFromDbTemplateIfConfigured", "RESEND_API_KEY not set", {
      reference: payload.paymentReference,
    });
    await writeNotificationLog({
      booking_id: bid,
      channel: "email",
      template_key: "booking_confirmed",
      recipient: payload.customerEmail,
      status: "failed",
      error: "resend_not_configured",
      provider: "resend",
      role: "customer",
      event_type: CUSTOMER_PAYMENT_EVENT,
      payload: customerPaymentPayload({ payment_reference: payload.paymentReference, phase: "db_template" }),
    });
    return { usedRow: true, sent: false, error: "Email not configured" };
  }

  const allow = getVariableAllowlistFromRow(template);
  const data = buildBookingConfirmedTemplateData(payload) as Record<string, unknown>;
  const renderOpts = { allowedKeys: allow.length ? allow : undefined, escapeHtmlValues: true as const };
  const html = renderTemplate(template.content, data, renderOpts);
  const subjectRaw =
    template.subject?.trim() ? template.subject : "Booking confirmed — {{customer_name}}";
  const subject = renderTemplate(subjectRaw, data, renderOpts);

  const from = getDefaultFromAddress();
  try {
    const { error } = await resend.emails.send({
      from,
      to: payload.customerEmail,
      subject,
      html,
    });
    if (error) {
      await reportOperationalIssue("error", "sendBookingConfirmationFromDbTemplateIfConfigured", error.message, {
        reference: payload.paymentReference,
        to: payload.customerEmail,
      });
      await writeNotificationLog({
        booking_id: bid,
        channel: "email",
        template_key: "booking_confirmed",
        recipient: payload.customerEmail,
        status: "failed",
        error: error.message,
        provider: "resend",
        role: "customer",
        event_type: CUSTOMER_PAYMENT_EVENT,
        payload: customerPaymentPayload({
          subject,
          html,
          payment_reference: payload.paymentReference,
          source: "db_template",
        }),
      });
      return { usedRow: true, sent: false, error: error.message };
    }
    await logSystemEvent({
      level: "info",
      source: "email",
      message: "Booking confirmation email sent (DB template)",
      context: { reference: payload.paymentReference, to: payload.customerEmail },
    });
    await writeNotificationLog({
      booking_id: bid,
      channel: "email",
      template_key: "booking_confirmed",
      recipient: payload.customerEmail,
      status: "sent",
      error: null,
      provider: "resend",
      role: "customer",
      event_type: CUSTOMER_PAYMENT_EVENT,
      payload: customerPaymentPayload({
        subject,
        html,
        payment_reference: payload.paymentReference,
        source: "db_template",
      }),
    });
    return { usedRow: true, sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await reportOperationalIssue("error", "sendBookingConfirmationFromDbTemplateIfConfigured", msg, {
      reference: payload.paymentReference,
      to: payload.customerEmail,
    });
    await writeNotificationLog({
      booking_id: bid,
      channel: "email",
      template_key: "booking_confirmed",
      recipient: payload.customerEmail,
      status: "failed",
      error: msg,
      provider: "resend",
      role: "customer",
      event_type: CUSTOMER_PAYMENT_EVENT,
      payload: customerPaymentPayload({
        subject,
        html,
        payment_reference: payload.paymentReference,
        source: "db_template",
      }),
    });
    return { usedRow: true, sent: false, error: msg };
  }
}

export async function sendBookingConfirmationEmail(payload: BookingEmailPayload): Promise<{ sent: boolean; error?: string }> {
  const dbAttempt = await sendBookingConfirmationFromDbTemplateIfConfigured(payload);
  if (dbAttempt.usedRow && dbAttempt.sent) return { sent: true };

  if (dbAttempt.usedRow && !dbAttempt.sent) {
    await reportOperationalIssue("warn", "template_fallback", "Booking confirmation will use legacy HTML after DB template send failed", {
      bookingId: bookingIdForNotificationLog(payload),
      reference: payload.paymentReference,
      priorError: dbAttempt.error,
    });
    await logSystemEvent({
      level: "warn",
      source: "email",
      message: "Booking confirmation fell back to legacy HTML after DB template send failed",
      context: {
        reference: payload.paymentReference,
        to: payload.customerEmail,
        priorError: dbAttempt.error,
      },
    });
  }

  const resend = getResend();
  if (!resend) {
    await reportOperationalIssue("warn", "sendBookingConfirmationEmail", "RESEND_API_KEY not set", {
      reference: payload.paymentReference,
    });
    await writeNotificationLog({
      booking_id: bookingIdForNotificationLog(payload),
      channel: "email",
      template_key: dbAttempt.usedRow ? "booking_confirmed" : "legacy_booking_confirmation_html",
      recipient: payload.customerEmail,
      status: "failed",
      error: dbAttempt.usedRow ? dbAttempt.error ?? "resend_not_configured" : "resend_not_configured",
      provider: "resend",
      role: "customer",
      event_type: CUSTOMER_PAYMENT_EVENT,
      payload: customerPaymentPayload({
        payment_reference: payload.paymentReference,
        phase: "no_resend_client",
        attempted_legacy_after_template: dbAttempt.usedRow && !dbAttempt.sent,
      }),
    });
    return {
      sent: false,
      error: dbAttempt.usedRow ? dbAttempt.error ?? "Email not configured" : "Email not configured",
    };
  }

  const from = getDefaultFromAddress();
  const total = payload.totalPaidZar.toLocaleString("en-ZA");
  const appUrl = getPublicAppUrlBase();
  const accountBookingsUrl = `${appUrl}/dashboard/bookings`;
  const bookAgainUrl = `${appUrl}/booking?step=details`;

  const service = escapeHtml(payload.serviceLabel);
  const date = escapeHtml(payload.dateLabel);
  const time = escapeHtml(payload.timeLabel);
  const location = escapeHtml(payload.location?.trim() || "—");
  const cleanerRow = payload.cleanerName?.trim()
    ? `<p><strong>Cleaner:</strong> ${escapeHtml(payload.cleanerName.trim())}</p>`
    : "";

  const html = `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; color: #1f2937;">

  <h2 style="margin-bottom: 8px;">
    Shalean<span style="color:#2563eb;">.</span>
  </h2>

  <h1 style="font-size: 22px; margin: 0 0 12px;">
    Booking confirmed ✅
  </h1>

  <p style="color:#6b7280; margin-bottom: 20px;">
    Your cleaning is scheduled. We&apos;ve got everything covered.
  </p>

  ${
    payload.showCleanerSubstitutionNotice
      ? `<div style="border:1px solid #fcd34d; background:#fffbeb; border-radius:12px; padding:14px 16px; margin-bottom:18px; color:#78350f; font-size:14px; line-height:1.45;">
    <strong>Cleaner update:</strong> Your selected cleaner isn&apos;t available at that time — we&apos;ve assigned a similar top-rated cleaner.
  </div>`
      : ""
  }

  <div style="border:1px solid #e5e7eb; border-radius:12px; padding:16px; margin-bottom:20px;">

    <p><strong>Service:</strong> ${service}</p>
    <p><strong>Date:</strong> ${date}</p>
    <p><strong>Time:</strong> ${time}</p>
    <p><strong>Location:</strong> ${location}</p>
    ${cleanerRow}

    <hr style="border:none; border-top:1px solid #eee; margin:12px 0;" />

    <p style="font-size:18px;">
      <strong>Total:</strong>
      <span style="color:#059669;">R ${total}</span>
    </p>
    <p style="font-size:12px; color:#6b7280; margin:8px 0 0;">
      ${payload.bookingId?.trim() ? `Booking ID: <span style="font-family:monospace;">${escapeHtml(payload.bookingId.trim())}</span><br/>` : ""}
      Payment ref: <span style="font-family:monospace;">${escapeHtml(payload.paymentReference)}</span>
    </p>
  </div>

  <div style="margin-bottom:20px; font-size:14px; color:#374151;">
    ✔ Verified cleaners<br/>
    ✔ Secure payment<br/>
    ✔ Satisfaction guaranteed
  </div>

  <a href="${escapeAttr(accountBookingsUrl)}"
     style="display:block; text-align:center; background:#2563eb; color:white; padding:14px; border-radius:10px; text-decoration:none; font-weight:600;">
     View your booking
  </a>

  <p style="margin-top:20px; font-size:14px; color:#374151;">
    Want the same cleaner next time?<br/>
    <a href="${escapeAttr(bookAgainUrl)}" style="color:#2563eb; font-weight:500; text-decoration:none;">
      Book again in 10 seconds →
    </a>
  </p>

  <p style="margin-top:20px; font-size:12px; color:#9ca3af;">
    Need help? Reply to this email or contact support.<br/>
    If you didn&apos;t make this booking, contact us immediately.
  </p>

</div>
`;

  const legacyBid = bookingIdForNotificationLog(payload);
  const legacySubject = "Booking confirmed";
  const legacyPayloadMeta: Record<string, unknown> = customerPaymentPayload({
    subject: legacySubject,
    html,
    payment_reference: payload.paymentReference,
    source: "legacy_html",
  });
  if (dbAttempt.usedRow && !dbAttempt.sent) {
    legacyPayloadMeta.after_template_failure = true;
    legacyPayloadMeta.prior_template_error = dbAttempt.error ?? null;
  }

  try {
    const { error } = await resend.emails.send({
      from,
      to: payload.customerEmail,
      subject: legacySubject,
      html,
    });

    if (error) {
      await reportOperationalIssue("error", "sendBookingConfirmationEmail", error.message, {
        reference: payload.paymentReference,
        to: payload.customerEmail,
      });
      await writeNotificationLog({
        booking_id: legacyBid,
        channel: "email",
        template_key: "legacy_booking_confirmation_html",
        recipient: payload.customerEmail,
        status: "failed",
        error: error.message,
        provider: "resend",
        role: "customer",
        event_type: CUSTOMER_PAYMENT_EVENT,
        payload: legacyPayloadMeta,
      });
      return { sent: false, error: error.message };
    }
    await logSystemEvent({
      level: "info",
      source: "email",
      message: "Booking confirmation email sent",
      context: { reference: payload.paymentReference, to: payload.customerEmail },
    });
    await writeNotificationLog({
      booking_id: legacyBid,
      channel: "email",
      template_key: "legacy_booking_confirmation_html",
      recipient: payload.customerEmail,
      status: "sent",
      error: null,
      provider: "resend",
      role: "customer",
      event_type: CUSTOMER_PAYMENT_EVENT,
      payload: legacyPayloadMeta,
    });
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await reportOperationalIssue("error", "email", `Booking confirmation email failed: ${msg}`, {
      err: msg,
      reference: payload.paymentReference,
      to: payload.customerEmail,
    });
    await writeNotificationLog({
      booking_id: legacyBid,
      channel: "email",
      template_key: "legacy_booking_confirmation_html",
      recipient: payload.customerEmail,
      status: "failed",
      error: msg,
      provider: "resend",
      role: "customer",
      event_type: CUSTOMER_PAYMENT_EVENT,
      payload: legacyPayloadMeta,
    });
    return { sent: false, error: msg };
  }
}

/** Comma-separated admin inboxes for operational alerts (required in production for notifyBookingEvent). */
export function getAdminNotificationRecipients(): string[] {
  const raw = process.env.ADMIN_NOTIFICATION_EMAIL?.trim();
  if (!raw) {
    throw new Error("ADMIN_NOTIFICATION_EMAIL is required for admin booking notifications");
  }
  const list = raw
    .split(",")
    .map((e) => e.trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (!list.length) {
    throw new Error("ADMIN_NOTIFICATION_EMAIL must contain at least one valid email");
  }
  return list;
}

export async function sendAdminHtmlEmail(params: {
  subject: string;
  html: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  const ctx = params.context ?? {};
  const bookingId =
    typeof ctx.bookingId === "string" && ctx.bookingId.trim() ? ctx.bookingId.trim() : undefined;
  const rawIds = Array.isArray(ctx.bookingIds) ? ctx.bookingIds : [];
  const bookingIds = rawIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  const adminChannel = `admin:${String(ctx.type ?? "html")}`;

  const adminTemplateKey = `admin_${String(ctx.type ?? "html")}`;
  const adminEventType = String(ctx.type ?? "admin_html").trim().slice(0, 96) || "admin_html";

  let recipients: string[];
  try {
    recipients = getAdminNotificationRecipients();
  } catch (e) {
    await reportOperationalIssue("error", "sendAdminHtmlEmail", String(e), ctx);
    await logPipelineEmailTelemetry({
      role: "admin",
      channel: adminChannel,
      sent: false,
      error: String(e),
      bookingId,
      bookingIds: bookingIds.length ? bookingIds : undefined,
    });
    await writeNotificationLog({
      booking_id: bookingId ?? null,
      channel: "email",
      template_key: adminTemplateKey,
      recipient: "(admin_recipients_unresolved)",
      status: "failed",
      error: String(e),
      provider: "resend",
      role: "admin",
      event_type: adminEventType,
      payload: { subject: params.subject, html: params.html, step: adminEventType, ...ctx },
    });
    return;
  }

  const adminLogPayload = (): Record<string, unknown> => ({
    subject: params.subject,
    html: params.html,
    bcc_count: Math.max(0, recipients.length - 1),
    booking_ids: bookingIds.length ? bookingIds : undefined,
    step: adminEventType,
  });

  const resend = getResend();
  if (!resend) {
    await reportOperationalIssue("warn", "sendAdminHtmlEmail", "RESEND_API_KEY not set", ctx);
    await logPipelineEmailTelemetry({
      role: "admin",
      channel: adminChannel,
      sent: false,
      error: "RESEND_API_KEY not set",
      bookingId,
      bookingIds: bookingIds.length ? bookingIds : undefined,
    });
    await writeNotificationLog({
      booking_id: bookingId ?? null,
      channel: "email",
      template_key: adminTemplateKey,
      recipient: recipients[0] ?? "(no_recipient)",
      status: "failed",
      error: "RESEND_API_KEY not set",
      provider: "resend",
      role: "admin",
      event_type: adminEventType,
      payload: adminLogPayload(),
    });
    return;
  }
  const from = getDefaultFromAddress();
  const to = recipients[0]!;
  const bcc = recipients.length > 1 ? recipients.slice(1) : undefined;
  try {
    const { error } = await resend.emails.send({
      from,
      to,
      bcc: bcc && bcc.length ? bcc : undefined,
      subject: params.subject,
      html: params.html,
    });
    if (error) {
      await reportOperationalIssue("warn", "sendAdminHtmlEmail", error.message, ctx);
      await logPipelineEmailTelemetry({
        role: "admin",
        channel: adminChannel,
        sent: false,
        error: error.message,
        bookingId,
        bookingIds: bookingIds.length ? bookingIds : undefined,
      });
      await writeNotificationLog({
        booking_id: bookingId ?? null,
        channel: "email",
        template_key: adminTemplateKey,
        recipient: to,
        status: "failed",
        error: error.message,
        provider: "resend",
        role: "admin",
        event_type: adminEventType,
        payload: adminLogPayload(),
      });
      return;
    }
    await logPipelineEmailTelemetry({
      role: "admin",
      channel: adminChannel,
      sent: true,
      bookingId,
      bookingIds: bookingIds.length ? bookingIds : undefined,
    });
    await writeNotificationLog({
      booking_id: bookingId ?? null,
      channel: "email",
      template_key: adminTemplateKey,
      recipient: to,
      status: "sent",
      error: null,
      provider: "resend",
      role: "admin",
      event_type: adminEventType,
      payload: adminLogPayload(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await reportOperationalIssue("warn", "sendAdminHtmlEmail", msg, ctx);
    await logPipelineEmailTelemetry({
      role: "admin",
      channel: adminChannel,
      sent: false,
      error: msg,
      bookingId,
      bookingIds: bookingIds.length ? bookingIds : undefined,
    });
    await writeNotificationLog({
      booking_id: bookingId ?? null,
      channel: "email",
      template_key: adminTemplateKey,
      recipient: to,
      status: "failed",
      error: msg,
      provider: "resend",
      role: "admin",
      event_type: adminEventType,
      payload: adminLogPayload(),
    });
  }
}

const PAYMENT_LINK_EMAIL_EVENT = "payment_link_sent";

export type PaymentLinkEmailInput = {
  customerEmail: string;
  customerName?: string | null;
  serviceLabel: string;
  dateLabel: string;
  timeLabel: string;
  amountZar: number | null;
  /** Paystack `authorization_url` (server-issued only). */
  paymentUrl: string;
  bookingId: string;
  paystackReference: string;
};

/**
 * Admin / ops: email with a working Paystack checkout button.
 * URL is not passed through `renderTemplate` HTML escape (would break query strings).
 */
export async function sendPaymentLinkEmail(input: PaymentLinkEmailInput): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  const to = normalizeEmail(input.customerEmail.trim());
  const bid = input.bookingId.trim() || null;
  if (!to) {
    await writeNotificationLog({
      booking_id: bid,
      channel: "email",
      template_key: "payment_link",
      recipient: input.customerEmail,
      status: "failed",
      error: "invalid_email",
      provider: "resend",
      role: "customer",
      event_type: PAYMENT_LINK_EMAIL_EVENT,
      payload: { paystack_reference: input.paystackReference },
    });
    return { sent: false, error: "Invalid email" };
  }

  if (!resend) {
    await reportOperationalIssue("warn", "sendPaymentLinkEmail", "RESEND_API_KEY not set", {
      reference: input.paystackReference,
    });
    await writeNotificationLog({
      booking_id: bid,
      channel: "email",
      template_key: "payment_link",
      recipient: to,
      status: "failed",
      error: "resend_not_configured",
      provider: "resend",
      role: "customer",
      event_type: PAYMENT_LINK_EMAIL_EVENT,
      payload: { paystack_reference: input.paystackReference },
    });
    return { sent: false, error: "Email not configured" };
  }

  const greet =
    (input.customerName?.trim() || to.split("@")[0]?.replace(/[.+_]/g, " ").trim() || "there").slice(0, 120);
  const amountBlock =
    input.amountZar != null && Number.isFinite(input.amountZar)
      ? `<p style="margin:12px 0 0;"><strong>Total due:</strong> R ${input.amountZar.toLocaleString("en-ZA")}</p>`
      : "";

  const appUrl = getPublicAppUrlBase();
  const trustPayPageHref =
    appUrl && input.bookingId?.trim() && input.paystackReference?.trim()
      ? `${appUrl.replace(/\/$/, "")}/pay/${encodeURIComponent(input.bookingId.trim())}?ref=${encodeURIComponent(input.paystackReference.trim())}`
      : input.paymentUrl;

  const html = `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; color: #1f2937;">
  <h2>Shalean<span style="color:#2563eb;">.</span></h2>
  <h1 style="font-size: 22px; margin: 0 0 12px;">Complete your booking payment</h1>
  <p style="color:#374151;">Hi ${escapeHtml(greet)},</p>
  <p style="color:#374151;">Your cleaning visit is reserved. Pay securely below to confirm.</p>
  <div style="border:1px solid #e5e7eb; border-radius:12px; padding:16px; margin: 18px 0;">
    <p><strong>Service:</strong> ${escapeHtml(input.serviceLabel)}</p>
    <p><strong>Date:</strong> ${escapeHtml(input.dateLabel)}</p>
    <p><strong>Time:</strong> ${escapeHtml(input.timeLabel)}</p>
    ${amountBlock}
    <p style="font-size:12px;color:#6b7280;margin-top:12px;">
      Booking: <span style="font-family:monospace;">${escapeHtml(input.bookingId)}</span><br/>
      Reference: <span style="font-family:monospace;">${escapeHtml(input.paystackReference)}</span>
    </p>
  </div>
  <p style="margin: 24px 0;">
    <a href="${trustPayPageHref}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Pay now</a>
  </p>
  <p style="font-size:12px;color:#6b7280;">If the button does not work, copy this link into your browser:<br/>
  <span style="word-break:break-all;font-family:monospace;color:#111827;">${escapeHtml(input.paymentUrl)}</span></p>
</div>`;

  const from = getDefaultFromAddress();
  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: `Complete payment — ${input.serviceLabel}`,
      html,
    });
    if (error) {
      await reportOperationalIssue("error", "sendPaymentLinkEmail", error.message, {
        reference: input.paystackReference,
        to,
      });
      await writeNotificationLog({
        booking_id: bid,
        channel: "email",
        template_key: "payment_link",
        recipient: to,
        status: "failed",
        error: error.message,
        provider: "resend",
        role: "customer",
        event_type: PAYMENT_LINK_EMAIL_EVENT,
        payload: { paystack_reference: input.paystackReference },
      });
      return { sent: false, error: error.message };
    }
    await logSystemEvent({
      level: "info",
      source: "email",
      message: "Payment link email sent",
      context: { reference: input.paystackReference, to, bookingId: input.bookingId },
    });
    await writeNotificationLog({
      booking_id: bid,
      channel: "email",
      template_key: "payment_link",
      recipient: to,
      status: "sent",
      error: null,
      provider: "resend",
      role: "customer",
      event_type: PAYMENT_LINK_EMAIL_EVENT,
      payload: { paystack_reference: input.paystackReference },
    });
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await reportOperationalIssue("error", "sendPaymentLinkEmail", msg, { reference: input.paystackReference, to });
    await writeNotificationLog({
      booking_id: bid,
      channel: "email",
      template_key: "payment_link",
      recipient: to,
      status: "failed",
      error: msg,
      provider: "resend",
      role: "customer",
      event_type: PAYMENT_LINK_EMAIL_EVENT,
      payload: { paystack_reference: input.paystackReference },
    });
    return { sent: false, error: msg };
  }
}

export async function sendAdminNewBookingEmail(payload: BookingEmailPayload): Promise<void> {
  let recipients: string[];
  try {
    recipients = getAdminNotificationRecipients();
  } catch {
    return;
  }

  const resend = getResend();
  if (!resend) return;

  const from = getDefaultFromAddress();
  const total = payload.totalPaidZar.toLocaleString("en-ZA");
  const to = recipients[0]!;
  const bcc = recipients.length > 1 ? recipients.slice(1) : undefined;

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      bcc: bcc && bcc.length ? bcc : undefined,
      subject: `New booking — ${payload.serviceLabel}`,
      html: `<p>New paid booking</p><p>${escapeHtml(payload.customerEmail)} — R ${total}</p><p>Ref: ${escapeHtml(payload.paymentReference)}</p>`,
    });
    if (error) {
      await reportOperationalIssue("warn", "sendAdminNewBookingEmail", error.message, {
        reference: payload.paymentReference,
      });
      return;
    }
    await logSystemEvent({
      level: "info",
      source: "email",
      message: "Admin new-booking notification sent",
      context: { reference: payload.paymentReference },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await reportOperationalIssue("warn", "email", `Admin new-booking email failed: ${msg}`, {
      err: msg,
      reference: payload.paymentReference,
    });
  }
}

export async function sendCustomerBookingAssignedEmail(payload: BookingEmailPayload): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { sent: false, error: "Email not configured" };
  const from = getDefaultFromAddress();
  const html = `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; color: #1f2937;">
  <h2>Shalean<span style="color:#2563eb;">.</span></h2>
  <h1 style="font-size: 20px;">Cleaner assigned</h1>
  <p style="color:#6b7280;">A cleaner is now scheduled for your visit.</p>
  <div style="border:1px solid #e5e7eb; border-radius:12px; padding:16px;">
    <p><strong>Service:</strong> ${escapeHtml(payload.serviceLabel)}</p>
    <p><strong>Date:</strong> ${escapeHtml(payload.dateLabel)}</p>
    <p><strong>Time:</strong> ${escapeHtml(payload.timeLabel)}</p>
    <p><strong>Location:</strong> ${escapeHtml(payload.location?.trim() || "—")}</p>
    ${payload.cleanerName?.trim() ? `<p><strong>Cleaner:</strong> ${escapeHtml(payload.cleanerName.trim())}</p>` : ""}
    <p style="font-size:12px;color:#6b7280;margin-top:12px;">
      ${payload.bookingId?.trim() ? `Booking ID: <span style="font-family:monospace;">${escapeHtml(payload.bookingId.trim())}</span><br/>` : ""}
      Payment ref: <span style="font-family:monospace;">${escapeHtml(payload.paymentReference)}</span>
    </p>
  </div>
</div>`;
  try {
    const { error } = await resend.emails.send({
      from,
      to: payload.customerEmail,
      subject: `Cleaner assigned — ${payload.serviceLabel}`,
      html,
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendCustomerJobCompletedEmail(payload: BookingEmailPayload): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { sent: false, error: "Email not configured" };
  const from = getDefaultFromAddress();
  const appUrl = getPublicAppUrlBase();
  const bid = payload.bookingId?.trim() || payload.paymentReference;
  const reviewUrl = `${appUrl}/review?booking=${encodeURIComponent(bid)}`;
  const html = `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; color: #1f2937;">
  <h2>Shalean<span style="color:#2563eb;">.</span></h2>
  <h1 style="font-size: 20px;">Cleaning complete</h1>
  <p>Your <strong>${escapeHtml(payload.serviceLabel)}</strong> on <strong>${escapeHtml(payload.dateLabel)}</strong> is marked complete.</p>
  <p style="font-size:12px;color:#6b7280;">
    ${payload.bookingId?.trim() ? `Booking ID: <span style="font-family:monospace;">${escapeHtml(payload.bookingId.trim())}</span><br/>` : ""}
    Payment ref: <span style="font-family:monospace;">${escapeHtml(payload.paymentReference)}</span>
  </p>
  <p><a href="${escapeAttr(reviewUrl)}" style="color:#2563eb;font-weight:600;">Leave a review</a></p>
</div>`;
  try {
    const { error } = await resend.emails.send({
      from,
      to: payload.customerEmail,
      subject: `Cleaning complete — ${payload.serviceLabel}`,
      html,
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendCustomerBookingCancelledEmail(params: {
  customerEmail: string;
  serviceLabel: string;
  dateYmd: string | null;
  timeHm: string | null;
  bookingId: string;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { sent: false, error: "Email not configured" };
  const from = getDefaultFromAddress();
  const when =
    params.dateYmd && params.timeHm
      ? `${escapeHtml(params.dateYmd)} ${escapeHtml(params.timeHm.slice(0, 5))}`
      : "your scheduled time";
  const html = `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; color: #1f2937;">
  <h2>Shalean<span style="color:#2563eb;">.</span></h2>
  <h1 style="font-size: 20px;">Booking cancelled</h1>
  <p>Your <strong>${escapeHtml(params.serviceLabel)}</strong> for <strong>${when}</strong> has been cancelled.</p>
  <p style="font-size:12px;color:#6b7280;">Booking ID: <span style="font-family:monospace;">${escapeHtml(params.bookingId)}</span></p>
</div>`;
  try {
    const { error } = await resend.emails.send({
      from,
      to: params.customerEmail,
      subject: `Cancelled — ${params.serviceLabel}`,
      html,
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendCustomerRescheduledEmail(params: {
  customerEmail: string;
  bookingId: string;
  serviceLabel: string;
  previousDate: string;
  previousTime: string;
  newDate: string;
  newTime: string;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { sent: false, error: "Email not configured" };
  const from = getDefaultFromAddress();
  const html = `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; color: #1f2937;">
  <h2>Shalean<span style="color:#2563eb;">.</span></h2>
  <h1 style="font-size: 20px;">Booking rescheduled</h1>
  <p>Your <strong>${escapeHtml(params.serviceLabel)}</strong> time was updated.</p>
  <div style="border:1px solid #e5e7eb; border-radius:12px; padding:16px;">
    <p><strong>Previous:</strong> ${escapeHtml(params.previousDate)} ${escapeHtml(params.previousTime)}</p>
    <p><strong>New:</strong> ${escapeHtml(params.newDate)} ${escapeHtml(params.newTime)}</p>
    <p style="font-size:12px;color:#6b7280;">Booking ID: <span style="font-family:monospace;">${escapeHtml(params.bookingId)}</span></p>
  </div>
</div>`;
  try {
    const { error } = await resend.emails.send({
      from,
      to: params.customerEmail,
      subject: `Updated schedule — ${params.serviceLabel}`,
      html,
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendCustomerTwoHourReminderEmail(params: {
  customerEmail: string;
  serviceLabel: string;
  dateLabel: string;
  timeLabel: string;
  location: string;
  bookingId: string;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { sent: false, error: "Email not configured" };
  const from = getDefaultFromAddress();
  const appUrl = getPublicAppUrlBase();
  const dashUrl = `${appUrl}/dashboard/bookings`;
  const html = `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; color: #1f2937;">
  <h2>Shalean<span style="color:#2563eb;">.</span></h2>
  <h1 style="font-size: 20px;">Reminder: cleaning soon</h1>
  <p>Your <strong>${escapeHtml(params.serviceLabel)}</strong> is coming up.</p>
  <div style="border:1px solid #e5e7eb; border-radius:12px; padding:16px;">
    <p><strong>When:</strong> ${escapeHtml(params.dateLabel)} ${escapeHtml(params.timeLabel)}</p>
    <p><strong>Where:</strong> ${escapeHtml(params.location || "—")}</p>
    <p style="font-size:12px;color:#6b7280;">Booking ID: <span style="font-family:monospace;">${escapeHtml(params.bookingId)}</span></p>
  </div>
  <p><a href="${escapeAttr(dashUrl)}" style="color:#2563eb;font-weight:600;">Open dashboard</a></p>
</div>`;
  try {
    const { error } = await resend.emails.send({
      from,
      to: params.customerEmail,
      subject: `Reminder: ${params.serviceLabel} soon`,
      html,
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function buildBookingEmailPayload(params: {
  paymentReference: string;
  amountCents: number;
  customerEmail: string;
  snapshot: BookingSnapshotV1 | null;
  bookingId?: string | null;
  /** From `bookings.assignment_type` after checkout upsert (optional). */
  assignmentType?: string | null;
  /** From `bookings.fallback_reason` when substitution occurred. */
  fallbackReason?: string | null;
}): BookingEmailPayload {
  const locked = params.snapshot?.locked;
  const custName = params.snapshot?.customer?.name?.trim();
  const totalPaidZar =
    typeof params.snapshot?.total_zar === "number"
      ? params.snapshot.total_zar
      : Math.max(0, Math.round(params.amountCents / 100));

  let dateLabel = "—";
  let timeLabel = "—";
  if (locked?.date) {
    const [y, m, d] = locked.date.split("-").map(Number);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      dateLabel = new Date(y, m - 1, d).toLocaleDateString("en-ZA", {
        weekday: "long",
        day: "numeric",
        month: "short",
      });
    }
  }
  if (locked?.time) timeLabel = locked.time;

  const serviceLabel =
    locked?.service != null ? getServiceLabel(locked.service) : "Cleaning service";

  const emailNorm = params.customerEmail.trim() ? normalizeEmail(params.customerEmail) : params.customerEmail;

  const at = String(params.assignmentType ?? "").toLowerCase();
  const showCleanerSubstitutionNotice = at === "auto_fallback";

  return {
    customerEmail: emailNorm,
    customerName: custName || null,
    serviceLabel,
    dateLabel,
    timeLabel,
    location: locked?.location?.trim() ?? "",
    cleanerName: params.snapshot?.cleaner_name ?? null,
    totalPaidZar,
    paymentReference: params.paymentReference,
    bookingId: params.bookingId?.trim() ?? null,
    showCleanerSubstitutionNotice,
    fallbackReason: params.fallbackReason?.trim() ? params.fallbackReason.trim() : null,
  };
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
