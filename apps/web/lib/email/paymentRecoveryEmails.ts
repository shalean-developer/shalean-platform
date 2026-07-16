import { Resend } from "resend";
import { getDefaultFromAddress } from "@/lib/email/sendBookingEmail";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { isCustomerOutboundPaused } from "@/lib/notifications/customerOutboundPause";
import { writeNotificationLog } from "@/lib/notifications/notificationLogWrite";
import { trustPayPageUrl } from "@/lib/pay/trustPayPageUrl";
import type { PaymentRecoveryJobType } from "@/lib/booking/paymentRecoverySkipReasons";
import { safeResendSend } from "@/lib/email/safeResendSend";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export type PaymentRecoveryEmailContext = {
  bookingId: string;
  to: string;
  customerName: string | null;
  serviceLabel: string;
  dateLabel: string;
  timeLabel: string;
  amountZar: number | null;
  paymentUrl: string;
  paystackReference: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function brandShell(inner: string): string {
  return `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; color: #1f2937;">
  <h2 style="margin-bottom: 8px;">Shalean<span style="color:#2563eb;">.</span></h2>
  ${inner}
  <p style="margin-top: 20px; font-size: 12px; color: #9ca3af;">Shalean Cleaning Services</p>
</div>`;
}

function greetingName(ctx: PaymentRecoveryEmailContext): string {
  const n = ctx.customerName?.trim();
  if (n) return n;
  const local = ctx.to.includes("@") ? ctx.to.split("@")[0]?.replace(/[.+_]/g, " ").trim() : "";
  return local || "there";
}

function amountLine(ctx: PaymentRecoveryEmailContext): string {
  if (ctx.amountZar != null && Number.isFinite(ctx.amountZar) && ctx.amountZar > 0) {
    return `<p><strong>Amount due:</strong> R ${Math.round(ctx.amountZar).toLocaleString("en-ZA")}</p>`;
  }
  return "";
}

function bookingDetailsBlock(ctx: PaymentRecoveryEmailContext): string {
  return `
  <div style="border:1px solid #e5e7eb; border-radius:12px; padding:16px; margin-bottom:16px;">
    <p><strong>Service:</strong> ${escapeHtml(ctx.serviceLabel)}</p>
    <p><strong>When:</strong> ${escapeHtml(ctx.dateLabel)} at ${escapeHtml(ctx.timeLabel)}</p>
    ${amountLine(ctx)}
  </div>`;
}

function payButton(ctx: PaymentRecoveryEmailContext): string {
  return `
  <p style="margin: 16px 0;">
    <a href="${escapeAttr(ctx.paymentUrl)}" style="display:inline-block; background:#2563eb; color:#fff; text-decoration:none; padding:12px 20px; border-radius:10px; font-weight:600;">Complete payment</a>
  </p>`;
}

async function sendPaymentRecovery(
  source: PaymentRecoveryJobType,
  subject: string,
  html: string,
  ctx: PaymentRecoveryEmailContext,
): Promise<{ sent: boolean; error?: string }> {
  const { paused } = await isCustomerOutboundPaused();
  if (paused) return { sent: false, error: "customer_outbound_paused" };
  const resend = getResend();
  if (!resend) {
    await reportOperationalIssue("warn", source, "RESEND_API_KEY not set", { bookingId: ctx.bookingId });
    await writeNotificationLog({
      booking_id: ctx.bookingId,
      channel: "email",
      template_key: source,
      recipient: ctx.to,
      status: "failed",
      error: "resend_not_configured",
      provider: "resend",
      role: "customer",
      event_type: "payment_recovery",
      payload: { step: source },
    });
    return { sent: false, error: "Email not configured" };
  }

  const from = getDefaultFromAddress();
  try {
    const { error } = await safeResendSend({ from, to: ctx.to, subject, html });
    if (error) {
      await reportOperationalIssue("error", source, error.message, { bookingId: ctx.bookingId, email: ctx.to });
      await writeNotificationLog({
        booking_id: ctx.bookingId,
        channel: "email",
        template_key: source,
        recipient: ctx.to,
        status: "failed",
        error: error.message.slice(0, 500),
        provider: "resend",
        role: "customer",
        event_type: "payment_recovery",
        payload: { step: source },
      });
      return { sent: false, error: error.message };
    }
    await logSystemEvent({
      level: "info",
      source,
      message: "Payment recovery email sent",
      context: { bookingId: ctx.bookingId, email: ctx.to },
    });
    await writeNotificationLog({
      booking_id: ctx.bookingId,
      channel: "email",
      template_key: source,
      recipient: ctx.to,
      status: "sent",
      provider: "resend",
      role: "customer",
      event_type: "payment_recovery",
      payload: { step: source },
    });
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await reportOperationalIssue("error", source, `Send threw: ${msg}`, { bookingId: ctx.bookingId, email: ctx.to });
    await writeNotificationLog({
      booking_id: ctx.bookingId,
      channel: "email",
      template_key: source,
      recipient: ctx.to,
      status: "failed",
      error: msg.slice(0, 500),
      provider: "resend",
      role: "customer",
      event_type: "payment_recovery",
      payload: { step: source },
    });
    return { sent: false, error: msg };
  }
}

function buildReminder1hHtml(ctx: PaymentRecoveryEmailContext): string {
  const name = escapeHtml(greetingName(ctx));
  const inner = `
  <h1 style="font-size: 22px; margin: 0 0 12px;">Complete your booking payment</h1>
  <p style="color:#6b7280; margin-bottom: 16px;">Hi ${name}, your cleaning booking is reserved but payment is still outstanding.</p>
  ${bookingDetailsBlock(ctx)}
  <p style="color:#374151; margin-bottom: 12px;">Please complete payment soon to confirm your slot.</p>
  ${payButton(ctx)}
  <p style="font-size: 13px; color: #6b7280;">If you&apos;ve already paid, you can ignore this email.</p>`;
  return brandShell(inner);
}

function buildReminder24hHtml(ctx: PaymentRecoveryEmailContext): string {
  const name = escapeHtml(greetingName(ctx));
  const inner = `
  <h1 style="font-size: 22px; margin: 0 0 12px;">Final reminder: payment still due</h1>
  <p style="color:#6b7280; margin-bottom: 16px;">Hi ${name}, we&apos;re still waiting for payment on your booking request.</p>
  ${bookingDetailsBlock(ctx)}
  <p style="color:#374151; margin-bottom: 12px;">This is your final reminder — complete payment to keep your booking request active.</p>
  ${payButton(ctx)}
  <p style="font-size: 13px; color: #6b7280;">Need help? Reply to this email or contact us on WhatsApp.</p>`;
  return brandShell(inner);
}

function buildExpiredHtml(ctx: PaymentRecoveryEmailContext): string {
  const name = escapeHtml(greetingName(ctx));
  const base = getPublicAppUrlBase();
  const bookUrl = `${base}/book`;
  const inner = `
  <h1 style="font-size: 22px; margin: 0 0 12px;">Your unpaid booking has expired</h1>
  <p style="color:#6b7280; margin-bottom: 16px;">Hi ${name}, your unpaid booking request has expired and the slot is no longer held.</p>
  ${bookingDetailsBlock(ctx)}
  <p style="color:#374151; margin-bottom: 12px;">You can start a new booking anytime — it only takes a minute.</p>
  <p style="margin: 16px 0;">
    <a href="${escapeAttr(bookUrl)}" style="display:inline-block; background:#2563eb; color:#fff; text-decoration:none; padding:12px 20px; border-radius:10px; font-weight:600;">Book again</a>
  </p>`;
  return brandShell(inner);
}

export async function sendPaymentRecoveryEmail(
  jobType: PaymentRecoveryJobType,
  ctx: PaymentRecoveryEmailContext,
): Promise<{ sent: boolean; error?: string }> {
  switch (jobType) {
    case "payment_reminder_1h":
      return sendPaymentRecovery(jobType, "Reminder: complete your booking payment", buildReminder1hHtml(ctx), ctx);
    case "payment_reminder_24h":
      return sendPaymentRecovery(jobType, "Final reminder: your booking payment is due", buildReminder24hHtml(ctx), ctx);
    case "booking_payment_expired":
      return sendPaymentRecovery(jobType, "Your unpaid booking request has expired", buildExpiredHtml(ctx), ctx);
    default:
      return { sent: false, error: `Unknown job_type: ${jobType}` };
  }
}

export function buildPaymentRecoveryEmailContext(booking: Record<string, unknown>): PaymentRecoveryEmailContext | null {
  const bookingId = String(booking.id ?? "").trim();
  const to = String(booking.customer_email ?? "").trim().toLowerCase();
  if (!bookingId || !to) return null;

  const snap = booking.booking_snapshot as { locked?: { date?: string; time?: string; service?: string } } | null;
  const locked = snap?.locked;
  const serviceLabel =
    typeof booking.service === "string" && booking.service.trim()
      ? booking.service.trim()
      : locked?.service
        ? String(locked.service)
        : "Cleaning";

  let dateLabel = "—";
  let timeLabel = "—";
  const dateYmd = (typeof booking.date === "string" ? booking.date : locked?.date) ?? "";
  if (dateYmd && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    const [y, m, d] = dateYmd.split("-").map(Number);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      dateLabel = new Date(y, m - 1, d).toLocaleDateString("en-ZA", {
        weekday: "long",
        day: "numeric",
        month: "short",
      });
    }
  }
  const timeHm = (typeof booking.time === "string" ? booking.time : locked?.time) ?? "";
  if (timeHm) timeLabel = timeHm;

  const totalRaw = booking.total_paid_zar;
  const amountZar =
    typeof totalRaw === "number" && Number.isFinite(totalRaw)
      ? Math.round(totalRaw)
      : typeof totalRaw === "string" && /^\d+(\.\d+)?$/.test(totalRaw.trim())
        ? Math.round(Number(totalRaw))
        : typeof booking.total_price === "number" && Number.isFinite(booking.total_price)
          ? Math.round(booking.total_price)
          : null;

  const paystackReference = String(booking.paystack_reference ?? "").trim();
  const paymentLink = typeof booking.payment_link === "string" ? booking.payment_link.trim() : "";
  const paymentUrl = trustPayPageUrl(bookingId, paystackReference, paymentLink || `${getPublicAppUrlBase()}/pay/${encodeURIComponent(bookingId)}`);

  const customerName = typeof booking.customer_name === "string" ? booking.customer_name.trim() : null;

  return {
    bookingId,
    to,
    customerName,
    serviceLabel,
    dateLabel,
    timeLabel,
    amountZar,
    paymentUrl,
    paystackReference,
  };
}
