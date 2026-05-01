import "server-only";

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assignConversionExperimentVariant } from "@/lib/conversion/assignConversionExperiment";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { getDefaultFromAddress } from "@/lib/email/sendBookingEmail";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { customerPhoneToE164 } from "@/lib/notifications/customerPhoneNormalize";
import { sendSmsFallback } from "@/lib/notifications/smsFallback";
import type { SmsRole } from "@/lib/notifications/smsPolicy";

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
  supabaseAdmin?: SupabaseClient | null;
}): Promise<boolean> {
  const base = getPublicAppUrlBase();
  const bookUrl = `${base}/booking/details`;
  let short = false;
  if (params.supabaseAdmin) {
    const { variant } = await assignConversionExperimentVariant(params.supabaseAdmin, {
      subjectId: params.userId,
      experimentKey: "email_copy_test",
    });
    short = variant === "variant_a";
  }
  const html = short
    ? brandShell(`
  <p style="font-size:16px;line-height:1.45;font-weight:600;">Ready for your next clean?</p>
  <p style="margin-top:20px;"><a href="${bookUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700;">Book now</a></p>
`)
    : brandShell(`
  <p style="font-size:15px;line-height:1.5;">We have not seen a booking from you in a little while.</p>
  <p style="font-size:15px;line-height:1.5;">If you would like to schedule your next clean, you can book in under a minute.</p>
  <p style="margin-top:18px;"><a href="${bookUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600;">Book again</a></p>
`);
  return sendGrowthHtml({
    source: "growth_retention_reminder",
    subject: short ? "Book your next clean" : "Time for your next clean?",
    html,
    to: params.to,
    userId: params.userId,
  });
}

export async function sendGrowthWinBackEmail(params: {
  to: string;
  userId: string;
  supabaseAdmin?: SupabaseClient | null;
}): Promise<boolean> {
  const base = getPublicAppUrlBase();
  const bookUrl = `${base}/booking/details`;
  let short = false;
  if (params.supabaseAdmin) {
    const { variant } = await assignConversionExperimentVariant(params.supabaseAdmin, {
      subjectId: params.userId,
      experimentKey: "email_copy_test",
    });
    short = variant === "variant_a";
  }
  const html = short
    ? brandShell(`
  <p style="font-size:16px;line-height:1.45;font-weight:600;">We would love you back.</p>
  <p style="margin-top:20px;"><a href="${bookUrl}" style="display:inline-block;background:#059669;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700;">See slots</a></p>
`)
    : brandShell(`
  <p style="font-size:15px;line-height:1.5;">We would love to welcome you back.</p>
  <p style="font-size:15px;line-height:1.5;">Here is a limited-time offer to restart your home cleaning routine — use the link below to see current availability.</p>
  <p style="margin-top:18px;"><a href="${bookUrl}" style="display:inline-block;background:#059669;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:600;">See availability</a></p>
`);
  return sendGrowthHtml({
    source: "growth_win_back",
    subject: short ? "Come back — book today" : "We would love to have you back",
    html,
    to: params.to,
    userId: params.userId,
  });
}

const SMS_MAX = 300;

/**
 * SMS fallback after a failed growth email, or primary touch when the user has phone but no email on file.
 * Short plain text; booking deep-link only (no WhatsApp).
 */
export async function sendGrowthTouchSms(params: {
  phone: string;
  userId: string;
  variant: "retention_reminder" | "win_back";
  smsRole: SmsRole;
}): Promise<boolean> {
  const e164 = customerPhoneToE164(params.phone.trim());
  if (!e164) {
    await logSystemEvent({
      level: "warn",
      source: "growth_sms",
      message: "Invalid phone for growth SMS",
      context: { userId: params.userId },
    });
    return false;
  }
  const base = getPublicAppUrlBase();
  const bookUrl = `${base}/booking/details`;
  const body =
    params.variant === "win_back"
      ? `Shalean: We'd love you back — book a clean in a tap: ${bookUrl}`.slice(0, SMS_MAX)
      : `Shalean: Time for your next clean? Book here: ${bookUrl}`.slice(0, SMS_MAX);
  const res = await sendSmsFallback({
    toE164: e164,
    body,
    context: { userId: params.userId, source: "growth_engine", variant: params.variant },
    smsRole: params.smsRole,
    recipientKind: "customer",
  });
  if (res.sent) {
    await logSystemEvent({
      level: "info",
      source: "growth_sms",
      message: "Growth SMS sent",
      context: { userId: params.userId, variant: params.variant, sms_role: params.smsRole },
    });
  }
  return res.sent;
}
