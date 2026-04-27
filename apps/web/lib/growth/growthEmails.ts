import "server-only";

import { Resend } from "resend";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { getDefaultFromAddress } from "@/lib/email/sendBookingEmail";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function brandShell(inner: string): string {
  return `
<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; color: #1f2937;">
  <h2 style="margin-bottom: 8px;">Shalean<span style="color:#2563eb;">.</span></h2>
  ${inner}
  <p style="margin-top: 20px; font-size: 12px; color: #9ca3af;">Shalean Cleaning Services</p>
</div>`;
}

async function sendGrowthHtml(params: {
  source: "growth_retention_reminder" | "growth_win_back";
  subject: string;
  html: string;
  to: string;
  userId: string;
}): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    await reportOperationalIssue("warn", params.source, "RESEND_API_KEY not set", { userId: params.userId });
    return false;
  }
  const from = getDefaultFromAddress();
  try {
    const { error } = await resend.emails.send({ from, to: params.to, subject: params.subject, html: params.html });
    if (error) {
      await reportOperationalIssue("error", params.source, error.message, { userId: params.userId });
      return false;
    }
    await logSystemEvent({
      level: "info",
      source: params.source,
      message: "Email sent",
      context: { userId: params.userId, email: params.to },
    });
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("error", params.source, msg, { userId: params.userId });
    return false;
  }
}

export async function sendGrowthRetentionReminderEmail(params: {
  to: string;
  userId: string;
}): Promise<boolean> {
  const base = getPublicAppUrlBase();
  const bookUrl = `${base}/booking?step=details`;
  const html = brandShell(`
  <p style="font-size:15px;line-height:1.5;">We have not seen a booking from you in a little while.</p>
  <p style="font-size:15px;line-height:1.5;">If you would like to schedule your next clean, you can book in under a minute.</p>
  <p style="margin-top:18px;"><a href="${bookUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600;">Book again</a></p>
`);
  return sendGrowthHtml({
    source: "growth_retention_reminder",
    subject: "Time for your next clean?",
    html,
    to: params.to,
    userId: params.userId,
  });
}

export async function sendGrowthWinBackEmail(params: { to: string; userId: string }): Promise<boolean> {
  const base = getPublicAppUrlBase();
  const bookUrl = `${base}/booking?step=details`;
  const html = brandShell(`
  <p style="font-size:15px;line-height:1.5;">We would love to welcome you back.</p>
  <p style="font-size:15px;line-height:1.5;">Here is a limited-time offer to restart your home cleaning routine — use the link below to see current availability.</p>
  <p style="margin-top:18px;"><a href="${bookUrl}" style="display:inline-block;background:#059669;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600;">See availability</a></p>
`);
  return sendGrowthHtml({
    source: "growth_win_back",
    subject: "We would love to have you back",
    html,
    to: params.to,
    userId: params.userId,
  });
}
