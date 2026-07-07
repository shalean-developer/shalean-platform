import { Resend } from "resend";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { isCustomerOutboundPaused } from "@/lib/notifications/customerOutboundPause";
import { getDefaultFromAddress } from "@/lib/email/sendBookingEmail";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { customerAccountBookingsUrl } from "@/lib/customer/customerAccountPaths";
import { sendCustomerEmailWithDbTemplateFallback } from "@/lib/email/customerEmailFromTemplate";
import { buildLifecycleTemplateData } from "@/lib/templates/bookingEmailTemplateData";
import { logReviewKpiEvent } from "@/lib/reviews/reviewKpiServer";

export type SendReviewEmailOptions = {
  /** When false, skips funnel `review_prompt_sent` KPI (e.g. admin test sends). Default true. */
  logPromptKpi?: boolean;
  promptKind?: "initial" | "reminder" | "manual";
  source?: string;
};

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
  const { paused } = await isCustomerOutboundPaused();
  if (paused) return { sent: false, error: "customer_outbound_paused" };
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

function buildReminderHtml(ctx: LifecycleEmailBookingContext): string {
  const base = getPublicAppUrlBase();
  const accountUrl = customerAccountBookingsUrl(base);
  const bookUrl = `${base}/book`;
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

  return brandShell(inner);
}

/** ~24h before appointment */
export async function sendReminderEmail(ctx: LifecycleEmailBookingContext): Promise<{ sent: boolean; error?: string }> {
  const { paused } = await isCustomerOutboundPaused();
  if (paused) return { sent: false, error: "customer_outbound_paused" };
  if (!process.env.RESEND_API_KEY?.trim()) {
    await reportOperationalIssue("warn", "reminder_email", "RESEND_API_KEY not set", { bookingId: ctx.bookingId });
    return { sent: false, error: "Email not configured" };
  }
  const result = await sendCustomerEmailWithDbTemplateFallback({
    to: ctx.to,
    templateKey: "booking_reminder_24h",
    data: buildLifecycleTemplateData(ctx),
    bookingId: ctx.bookingId,
    logEventType: "reminder_email",
    buildLegacy: () => ({
      subject: "Reminder: your clean is coming up",
      html: buildReminderHtml(ctx),
    }),
  });
  if (result.sent) {
    await logSystemEvent({
      level: "info",
      source: "reminder_email",
      message: "Email sent",
      context: { bookingId: ctx.bookingId, email: ctx.to },
    });
  }
  return result;
}

function buildReviewHtml(ctx: LifecycleEmailBookingContext): string {
  const base = getPublicAppUrlBase();
  const accountUrl = customerAccountBookingsUrl(base);
  const bookUrl = `${base}/book`;
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

  return brandShell(inner);
}

/** A few hours after appointment */
export async function sendReviewEmail(
  ctx: LifecycleEmailBookingContext,
  options?: SendReviewEmailOptions,
): Promise<{ sent: boolean; error?: string }> {
  const { paused } = await isCustomerOutboundPaused();
  if (paused) {
    const result = { sent: false, error: "customer_outbound_paused" };
    if (options?.logPromptKpi !== false) {
      logReviewKpiEvent("review_prompt_sent", {
        booking_id: ctx.bookingId,
        channel: "email",
        sent: false,
        error: result.error,
        prompt_kind: options?.promptKind ?? "initial",
        source: options?.source,
        customer_email: ctx.to,
      });
    }
    return result;
  }
  if (!process.env.RESEND_API_KEY?.trim()) {
    await reportOperationalIssue("warn", "review_email", "RESEND_API_KEY not set", { bookingId: ctx.bookingId });
    const result = { sent: false, error: "Email not configured" };
    if (options?.logPromptKpi !== false) {
      logReviewKpiEvent("review_prompt_sent", {
        booking_id: ctx.bookingId,
        channel: "email",
        sent: false,
        error: result.error,
        prompt_kind: options?.promptKind ?? "initial",
        source: options?.source,
        customer_email: ctx.to,
      });
    }
    return result;
  }
  const result = await sendCustomerEmailWithDbTemplateFallback({
    to: ctx.to,
    templateKey: "review_prompt",
    data: buildLifecycleTemplateData(ctx),
    bookingId: ctx.bookingId,
    logEventType: "review_email",
    buildLegacy: () => ({
      subject: "How was your cleaning?",
      html: buildReviewHtml(ctx),
    }),
  });
  if (result.sent) {
    await logSystemEvent({
      level: "info",
      source: "review_email",
      message: "Email sent",
      context: { bookingId: ctx.bookingId, email: ctx.to },
    });
  }
  if (options?.logPromptKpi !== false) {
    logReviewKpiEvent("review_prompt_sent", {
      booking_id: ctx.bookingId,
      channel: "email",
      sent: result.sent,
      error: result.error,
      prompt_kind: options?.promptKind ?? "initial",
      source: options?.source,
      customer_email: ctx.to,
    });
  }
  return result;
}

function buildRebookHtml(ctx: LifecycleEmailBookingContext): string {
  const base = getPublicAppUrlBase();
  const accountUrl = customerAccountBookingsUrl(base);
  const bookUrl = `${base}/book`;
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

  return brandShell(inner);
}

/** ~24h after appointment */
export async function sendRebookEmail(ctx: LifecycleEmailBookingContext): Promise<{ sent: boolean; error?: string }> {
  return sendLifecycle("rebook_email", "Book your next clean", buildRebookHtml(ctx), ctx.to, ctx.bookingId);
}

function buildRebookReminderHtml(ctx: LifecycleEmailBookingContext): string {
  const base = getPublicAppUrlBase();
  const accountUrl = customerAccountBookingsUrl(base);
  const bookUrl = `${base}/book`;

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

  return brandShell(inner);
}

/** ~14 days after appointment (retention nudge — same CTA as rebook_offer) */
export async function sendRebookReminderEmail(
  ctx: LifecycleEmailBookingContext,
): Promise<{ sent: boolean; error?: string }> {
  return sendLifecycle(
    "rebook_reminder_email",
    "Time for your next clean",
    buildRebookReminderHtml(ctx),
    ctx.to,
    ctx.bookingId,
  );
}

const LIFECYCLE_PREVIEW_SUBJECTS: Record<string, string> = {
  reminder_24h: "Reminder: your clean is coming up",
  review_request: "How was your cleaning?",
  rebook_offer: "Book your next clean",
  rebook_reminder: "Time for your next clean",
};

export function buildLifecycleEmailPreview(
  jobType: string,
  ctx: LifecycleEmailBookingContext,
): { subject: string; html: string } {
  let html = "";
  switch (jobType) {
    case "reminder_24h":
      html = buildReminderHtml(ctx);
      break;
    case "review_request":
      html = buildReviewHtml(ctx);
      break;
    case "rebook_offer":
      html = buildRebookHtml(ctx);
      break;
    case "rebook_reminder":
      html = buildRebookReminderHtml(ctx);
      break;
    default:
      html = buildReminderHtml(ctx);
      break;
  }
  return {
    subject: LIFECYCLE_PREVIEW_SUBJECTS[jobType] ?? "Lifecycle email preview",
    html,
  };
}

/** Admin test send — uses real Resend, does not touch booking_lifecycle_jobs. */
export async function sendTestLifecycleEmail(
  jobType: string,
  to: string,
): Promise<{ sent: boolean; error?: string }> {
  const ctx: LifecycleEmailBookingContext = {
    bookingId: "00000000-0000-4000-8000-000000000001",
    to,
    serviceLabel: "Standard cleaning (preview)",
    dateLabel: "Monday, 1 Jan",
    timeLabel: "09:00",
    location: "Cape Town (preview)",
  };

  switch (jobType) {
    case "reminder_24h":
      return sendReminderEmail(ctx);
    case "review_request":
      return sendReviewEmail(ctx, { logPromptKpi: false });
    case "rebook_offer":
      return sendRebookEmail(ctx);
    case "rebook_reminder":
      return sendRebookReminderEmail(ctx);
    default:
      return { sent: false, error: `Unknown job_type: ${jobType}` };
  }
}
