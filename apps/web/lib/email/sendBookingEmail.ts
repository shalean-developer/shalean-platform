import { Resend } from "resend";
import { getServiceLabel } from "@/components/booking/serviceCategories";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { logPipelineEmailTelemetry } from "@/lib/notifications/notificationEmailTelemetry";

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

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

const RESEND_FROM_FALLBACK = "Shalean Cleaning <onboarding@resend.dev>";

/**
 * Resend rejects invalid `from` (422) unless value is `email@domain` or `Name <email@domain>`.
 * Strips accidental outer quotes from env (common with Vercel / Windows .env).
 */
function resolveResendFromAddress(): string {
  const raw = process.env.RESEND_FROM;
  if (raw == null || String(raw).trim() === "") return RESEND_FROM_FALLBACK;

  let s = String(raw).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }

  const plainEmail = /^[^\s<>]+@[^\s<>]+$/;
  const angleEmail = /<[^\s<>]+@[^\s<>]+>/;
  if (plainEmail.test(s) || angleEmail.test(s)) {
    return s;
  }

  void reportOperationalIssue("warn", "sendBookingEmail", "RESEND_FROM is not a valid Resend from address; using onboarding@resend.dev fallback", {
    hint: "Use: you@verified.domain.com or Brand <you@verified.domain.com>",
    preview: s.slice(0, 120),
  });
  return RESEND_FROM_FALLBACK;
}

export function getDefaultFromAddress(): string {
  return resolveResendFromAddress();
}

export async function sendBookingConfirmationEmail(payload: BookingEmailPayload): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    await reportOperationalIssue("warn", "sendBookingConfirmationEmail", "RESEND_API_KEY not set", {
      reference: payload.paymentReference,
    });
    return { sent: false, error: "Email not configured" };
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

  try {
    const { error } = await resend.emails.send({
      from,
      to: payload.customerEmail,
      subject: "Booking confirmed",
      html,
    });

    if (error) {
      await reportOperationalIssue("error", "sendBookingConfirmationEmail", error.message, {
        reference: payload.paymentReference,
        to: payload.customerEmail,
      });
      return { sent: false, error: error.message };
    }
    await logSystemEvent({
      level: "info",
      source: "email",
      message: "Booking confirmation email sent",
      context: { reference: payload.paymentReference, to: payload.customerEmail },
    });
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await reportOperationalIssue("error", "email", `Booking confirmation email failed: ${msg}`, {
      err: msg,
      reference: payload.paymentReference,
      to: payload.customerEmail,
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
    return;
  }
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
      return;
    }
    await logPipelineEmailTelemetry({
      role: "admin",
      channel: adminChannel,
      sent: true,
      bookingId,
      bookingIds: bookingIds.length ? bookingIds : undefined,
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
