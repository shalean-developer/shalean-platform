import "server-only";

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assignConversionExperimentVariant } from "@/lib/conversion/assignConversionExperiment";
import { customerRebookLandingUrl } from "@/lib/customer/customerRebookLinkToken";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import {
  buildReengagementEmailHtml,
  buildReengagementEmailSubject,
} from "@/lib/email/reengagementEmailHtml";
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

async function loadFirstName(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.from("user_profiles").select("full_name").eq("id", userId).maybeSingle();
  const fullName =
    data && typeof data === "object" && "full_name" in data
      ? (data as { full_name?: string | null }).full_name
      : null;
  const trimmed = fullName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
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

function buildGrowthReengagementEmail(params: {
  userId: string;
  firstName: string | null;
  short: boolean;
}): { subject: string; html: string } {
  const base = getPublicAppUrlBase();
  const rebookUrl = customerRebookLandingUrl({ userId: params.userId });
  const bookUrl = `${base}/book`;

  if (params.short) {
    return {
      subject: params.firstName ? `Book your next clean, ${params.firstName}` : "Book your next clean",
      html: buildReengagementEmailHtml({ rebookUrl, bookUrl, firstName: params.firstName }),
    };
  }

  return {
    subject: buildReengagementEmailSubject(params.firstName),
    html: buildReengagementEmailHtml({ rebookUrl, bookUrl, firstName: params.firstName }),
  };
}

export async function sendGrowthRetentionReminderEmail(params: {
  to: string;
  userId: string;
  supabaseAdmin?: SupabaseClient | null;
}): Promise<boolean> {
  let short = false;
  let firstName: string | null = null;
  if (params.supabaseAdmin) {
    const { variant } = await assignConversionExperimentVariant(params.supabaseAdmin, {
      subjectId: params.userId,
      experimentKey: "email_copy_test",
    });
    short = variant === "variant_a";
    firstName = await loadFirstName(params.supabaseAdmin, params.userId);
  }

  const { subject, html } = buildGrowthReengagementEmail({
    userId: params.userId,
    firstName,
    short,
  });

  return sendGrowthHtml({
    source: "growth_retention_reminder",
    subject,
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
  let short = false;
  let firstName: string | null = null;
  if (params.supabaseAdmin) {
    const { variant } = await assignConversionExperimentVariant(params.supabaseAdmin, {
      subjectId: params.userId,
      experimentKey: "email_copy_test",
    });
    short = variant === "variant_a";
    firstName = await loadFirstName(params.supabaseAdmin, params.userId);
  }

  const { subject, html } = buildGrowthReengagementEmail({
    userId: params.userId,
    firstName,
    short,
  });

  return sendGrowthHtml({
    source: "growth_win_back",
    subject: short ? "Welcome back — book today" : subject,
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
  const rebookUrl = customerRebookLandingUrl({ userId: params.userId });
  const body =
    params.variant === "win_back"
      ? `Shalean: Welcome back! Book your next clean: ${rebookUrl}`.slice(0, SMS_MAX)
      : `Shalean: Time for your next clean? Book here: ${rebookUrl}`.slice(0, SMS_MAX);
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
