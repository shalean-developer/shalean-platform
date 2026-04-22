import { Resend } from "resend";
import { getServiceLabel } from "@/components/booking/serviceCategories";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

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
  const accountBookingsUrl = `${appUrl}/account/bookings`;
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
      Reference: <span style="font-family:monospace;">${escapeHtml(payload.paymentReference)}</span>
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

export async function sendAdminNewBookingEmail(payload: BookingEmailPayload): Promise<void> {
  const admin = process.env.ADMIN_NOTIFICATION_EMAIL?.trim();
  if (!admin) return;

  const resend = getResend();
  if (!resend) return;

  const from = getDefaultFromAddress();
  const total = payload.totalPaidZar.toLocaleString("en-ZA");

  try {
    const { error } = await resend.emails.send({
      from,
      to: admin,
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

export function buildBookingEmailPayload(params: {
  paymentReference: string;
  amountCents: number;
  customerEmail: string;
  snapshot: BookingSnapshotV1 | null;
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
