import { Resend } from "resend";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getDefaultFromAddress } from "@/lib/email/sendBookingEmail";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export type LifecycleEmailBookingContext = {
  bookingId: string;
  to: string;
  serviceLabel: string;
  dateLabel: string;
  timeLabel: string;
  location: string;
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

async function sendLifecycle(
  source: "reminder_email" | "review_email" | "rebook_email" | "rebook_reminder_email",
  subject: string,
  html: string,
  to: string,
  bookingId: string,
): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) {
    await reportOperationalIssue("warn", source, "RESEND_API_KEY not set", { bookingId });
    return { sent: false, error: "Email not configured" };
  }
  const from = getDefaultFromAddress();
  try {
    const { error } = await resend.emails.send({ from, to, subject, html });
    if (error) {
      await reportOperationalIssue("error", source, error.message, { bookingId, email: to });
      return { sent: false, error: error.message };
    }
    await logSystemEvent({
      level: "info",
      source,
      message: "Email sent",
      context: { bookingId, email: to },
    });
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await reportOperationalIssue("error", source, `Send threw: ${msg}`, { bookingId, email: to });
    return { sent: false, error: msg };
  }
}

/** ~24h before appointment */
export async function sendReminderEmail(ctx: LifecycleEmailBookingContext): Promise<{ sent: boolean; error?: string }> {
  const base = getPublicAppUrlBase();
  const accountUrl = `${base}/dashboard/bookings`;
  const bookUrl = `${base}/booking/details`;
  const reviewUrl = `${base}/review?booking=${encodeURIComponent(ctx.bookingId)}`;

  const inner = `
  <h1 style="font-size: 22px; margin: 0 0 12px;">Tomorrow&apos;s clean</h1>
  <p style="color:#6b7280; margin-bottom: 16px;">Quick reminder — your Shalean booking is coming up.</p>
  <div style="border:1px solid #e5e7eb; border-radius:12px; padding:16px; margin-bottom:16px;">
    <p><strong>Service:</strong> ${escapeHtml(ctx.serviceLabel)}</p>
    <p><strong>When:</strong> ${escapeHtml(ctx.dateLabel)} at ${escapeHtml(ctx.timeLabel)}</p>
    <p><strong>Where:</strong> ${escapeHtml(ctx.location || "—")}</p>
  </div>
  <p style="margin: 16px 0;">
    <a href="${escapeAttr(accountUrl)}" style="display:inline-block; background:#2563eb; color:#fff; text-decoration:none; padding:12px 20px; border-radius:10px; font-weight:600;">View your booking</a>
  </p>
  <p style="font-size: 14px; color: #374151;">
    <a href="${escapeAttr(bookUrl)}" style="color:#2563eb; font-weight:600;">Book again in 10 seconds →</a>
  </p>
  <p style="font-size: 13px; color: #6b7280;">
    After your clean: <a href="${escapeAttr(reviewUrl)}" style="color:#2563eb;">Leave a review</a>
  </p>`;

  return sendLifecycle("reminder_email", "Reminder: your clean is coming up", brandShell(inner), ctx.to, ctx.bookingId);
}

/** A few hours after appointment */
export async function sendReviewEmail(ctx: LifecycleEmailBookingContext): Promise<{ sent: boolean; error?: string }> {
  const base = getPublicAppUrlBase();
  const accountUrl = `${base}/dashboard/bookings`;
  const bookUrl = `${base}/booking/details`;
  const reviewUrl = `${base}/review?booking=${encodeURIComponent(ctx.bookingId)}`;
  const externalReview = process.env.NEXT_PUBLIC_REVIEW_URL?.trim();

  const inner = `
  <h1 style="font-size: 22px; margin: 0 0 12px;">How was your cleaning?</h1>
  <p style="color:#6b7280; margin-bottom: 16px;">We&apos;d love a quick word on how everything went.</p>
  <div style="border:1px solid #e5e7eb; border-radius:12px; padding:16px; margin-bottom:16px;">
    <p><strong>Service:</strong> ${escapeHtml(ctx.serviceLabel)}</p>
    <p><strong>Date:</strong> ${escapeHtml(ctx.dateLabel)}</p>
  </div>
  <p style="margin: 16px 0;">
    <a href="${escapeAttr(reviewUrl)}" style="display:inline-block; background:#059669; color:#fff; text-decoration:none; padding:12px 20px; border-radius:10px; font-weight:600;">Leave a review</a>
    <a href="${escapeAttr(bookUrl)}" style="display:inline-block; margin-left:10px; background:#2563eb; color:#fff; text-decoration:none; padding:12px 20px; border-radius:10px; font-weight:600;">Book again</a>
  </p>
  <p style="font-size: 14px;">
    <a href="${escapeAttr(accountUrl)}" style="color:#2563eb;">View your booking →</a>
    ${externalReview ? ` &nbsp;|&nbsp; <a href="${escapeAttr(externalReview)}" style="color:#2563eb;">Google review</a>` : ""}
  </p>`;

  return sendLifecycle("review_email", "How was your cleaning?", brandShell(inner), ctx.to, ctx.bookingId);
}

/** ~24h after appointment */
export async function sendRebookEmail(ctx: LifecycleEmailBookingContext): Promise<{ sent: boolean; error?: string }> {
  const base = getPublicAppUrlBase();
  const accountUrl = `${base}/dashboard/bookings`;
  const bookUrl = `${base}/booking/details`;
  const reviewUrl = `${base}/review?booking=${encodeURIComponent(ctx.bookingId)}`;

  const inner = `
  <h1 style="font-size: 22px; margin: 0 0 12px;">Ready for your next clean?</h1>
  <p style="color:#6b7280; margin-bottom: 16px;">Rebook in seconds — your last details can carry over.</p>
  <div style="border:1px solid #e5e7eb; border-radius:12px; padding:16px; margin-bottom:16px;">
    <p><strong>Last service:</strong> ${escapeHtml(ctx.serviceLabel)}</p>
    <p><strong>When:</strong> ${escapeHtml(ctx.dateLabel)}</p>
  </div>
  <p style="margin: 16px 0;">
    <a href="${escapeAttr(bookUrl)}" style="display:inline-block; background:#2563eb; color:#fff; text-decoration:none; padding:12px 20px; border-radius:10px; font-weight:600;">Book again</a>
  </p>
  <p style="font-size: 14px; color: #374151;">
    <a href="${escapeAttr(accountUrl)}" style="color:#2563eb;">Account &amp; bookings</a>
    &nbsp;·&nbsp;
    <a href="${escapeAttr(reviewUrl)}" style="color:#2563eb;">Leave a review</a>
  </p>`;

  return sendLifecycle("rebook_email", "Book your next clean", brandShell(inner), ctx.to, ctx.bookingId);
}

/** ~14 days after appointment (retention nudge — same CTA as rebook_offer) */
export async function sendRebookReminderEmail(
  ctx: LifecycleEmailBookingContext,
): Promise<{ sent: boolean; error?: string }> {
  const base = getPublicAppUrlBase();
  const accountUrl = `${base}/dashboard/bookings`;
  const bookUrl = `${base}/booking/details`;

  const inner = `
  <h1 style="font-size: 22px; margin: 0 0 12px;">Time for your next clean?</h1>
  <p style="color:#6b7280; margin-bottom: 16px;">Rebook in 10 seconds — your last visit was with Shalean.</p>
  <div style="border:1px solid #e5e7eb; border-radius:12px; padding:16px; margin-bottom:16px;">
    <p><strong>Last service:</strong> ${escapeHtml(ctx.serviceLabel)}</p>
    <p><strong>When:</strong> ${escapeHtml(ctx.dateLabel)}</p>
  </div>
  <p style="margin: 16px 0;">
    <a href="${escapeAttr(bookUrl)}" style="display:inline-block; background:#2563eb; color:#fff; text-decoration:none; padding:12px 20px; border-radius:10px; font-weight:600;">Rebook in 10 seconds</a>
  </p>
  <p style="font-size: 14px; color: #374151;">
    <a href="${escapeAttr(accountUrl)}" style="color:#2563eb;">Your bookings</a>
  </p>`;

  return sendLifecycle(
    "rebook_reminder_email",
    "Time for your next clean",
    brandShell(inner),
    ctx.to,
    ctx.bookingId,
  );
}
