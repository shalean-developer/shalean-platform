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
  const jobsUrl = `${appUrl}/cleaner/jobs`;

  const extrasBlock =
    params.extrasRequired && params.extrasRequired.length > 0
      ? `<li><strong>Extras required:</strong><ul>${params.extrasRequired
          .map((line) => `<li>${escapeHtml(line)}</li>`)
          .join("")}</ul></li>`
      : "";

  const html = `
    <p>Hi ${escapeHtml(params.cleanerName)},</p>
    <p><strong>New job assigned</strong> — you have a cleaning booking.</p>
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
    subject: `New Shalean job — ${params.dateLabel}`,
    html,
  });

  if (error) {
    await reportOperationalIssue("warn", "sendCleanerNewJobEmail", error.message, { bookingId: params.bookingId });
    return { sent: false, error: error.message };
  }

  return { sent: true };
}
