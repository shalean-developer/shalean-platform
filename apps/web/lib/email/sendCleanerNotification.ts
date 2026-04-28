import { Resend } from "resend";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { getDefaultFromAddress } from "@/lib/email/sendBookingEmail";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendCleanerNewJobEmail(params: {
  cleanerEmail: string;
  cleanerName: string;
  bookingId: string;
  service: string;
  dateLabel: string;
  timeLabel: string;
  location: string;
  /** Cleaner-facing pay (ZAR) when known — improves subject and opening line. */
  earningsZar?: number | null;
  earningsIsEstimate?: boolean;
  /** Human-readable lines, e.g. `Inside Oven (R59)` — from `bookings.extras` jsonb. */
  extrasRequired?: string[];
}): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    await reportOperationalIssue("warn", "sendCleanerNewJobEmail", "RESEND_API_KEY not set", {
      bookingId: params.bookingId,
    });
    return { sent: false, error: "Email not configured" };
  }

  const to = normalizeEmail(params.cleanerEmail);
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { sent: false, error: "Invalid cleaner email" };
  }

  const appUrl = getPublicAppUrlBase();
  const jobsUrl = `${appUrl}/cleaner`;

  const extrasBlock =
    params.extrasRequired && params.extrasRequired.length > 0
      ? `<li><strong>Extras required:</strong><ul>${params.extrasRequired
          .map((line) => `<li>${escapeHtml(line)}</li>`)
          .join("")}</ul></li>`
      : "";

  const zar = params.earningsZar != null && Number.isFinite(params.earningsZar) ? Math.round(params.earningsZar) : null;
  const payLead =
    zar != null
      ? params.earningsIsEstimate
        ? `<p><strong>New job:</strong> estimated pay <strong>R${zar.toLocaleString("en-ZA")}</strong> (final amount confirmed after completion).</p>`
        : `<p><strong>New job:</strong> earn <strong>R${zar.toLocaleString("en-ZA")}</strong> on this visit.</p>`
      : `<p><strong>New job assigned</strong> — you have a cleaning booking.</p>`;

  const html = `
    <p>Hi ${escapeHtml(params.cleanerName)},</p>
    ${payLead}
    <ul>
      <li><strong>Service:</strong> ${escapeHtml(params.service)}</li>
      <li><strong>When:</strong> ${escapeHtml(params.dateLabel)} ${escapeHtml(params.timeLabel)}</li>
      <li><strong>Location:</strong> ${escapeHtml(params.location || "—")}</li>
      ${extrasBlock}
    </ul>
    <p><a href="${jobsUrl}">Open My Jobs</a> in the cleaner app to view details, confirm availability when you are on a team, and update progress on the visit.</p>
    <p style="color:#666;font-size:12px">Booking ID: ${escapeHtml(params.bookingId)}</p>
  `;

  const { error } = await resend.emails.send({
    from: getDefaultFromAddress(),
    to: [to],
    subject:
      zar != null
        ? params.earningsIsEstimate
          ? `New Shalean job: ~R${zar.toLocaleString("en-ZA")} (est.) — ${params.dateLabel}`
          : `New Shalean job: Earn R${zar.toLocaleString("en-ZA")} — ${params.dateLabel}`
        : `New Shalean job — ${params.dateLabel}`,
    html,
  });

  if (error) {
    await reportOperationalIssue("warn", "sendCleanerNewJobEmail", error.message, { bookingId: params.bookingId });
    return { sent: false, error: error.message };
  }

  return { sent: true };
}
