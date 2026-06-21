import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { getDefaultFromAddress, getResend } from "@/lib/email/resendFrom";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

export type SendPasswordResetEmailResult =
  | { ok: true; channel: "resend" | "supabase" }
  | { ok: false; reason: "no_user" | "link_failed" | "email_failed" | "config" };

function isMissingUserError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("user not found") || m.includes("not found") || m.includes("no user");
}

/**
 * Generates a Supabase recovery link and delivers it via Resend (production path).
 * Falls back to Supabase's built-in mailer when Resend is not configured (local dev).
 */
export async function sendPasswordResetEmail(
  admin: SupabaseClient,
  rawEmail: string,
): Promise<SendPasswordResetEmailResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, reason: "no_user" };
  }

  const redirectTo = `${getPublicAppUrlBase()}/auth/reset-password`;
  const { data, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (linkErr) {
    if (isMissingUserError(linkErr.message)) {
      return { ok: false, reason: "no_user" };
    }
    await reportOperationalIssue("warn", "auth/password_reset", `generateLink: ${linkErr.message}`, { email });
    return { ok: false, reason: "link_failed" };
  }

  const actionLink = String(data?.properties?.action_link ?? "").trim();
  if (!actionLink) {
    await reportOperationalIssue("warn", "auth/password_reset", "generateLink returned no action_link", { email });
    return { ok: false, reason: "link_failed" };
  }

  const resend = getResend();
  if (!resend) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return { ok: false, reason: "config" };

    const pub = createClient(url, anon, { auth: { persistSession: false } });
    const { error: fallbackErr } = await pub.auth.resetPasswordForEmail(email, { redirectTo });
    if (fallbackErr) {
      await reportOperationalIssue("warn", "auth/password_reset", `supabase fallback: ${fallbackErr.message}`, { email });
      return { ok: false, reason: "email_failed" };
    }
    return { ok: true, channel: "supabase" };
  }

  const { error: sendErr } = await resend.emails.send({
    from: getDefaultFromAddress(),
    to: email,
    subject: "Reset your Shalean password",
    html: `
      <p>Hi,</p>
      <p>We received a request to reset the password for your Shalean account.</p>
      <p><a href="${actionLink}">Choose a new password</a></p>
      <p>This link expires after a short time. If you did not request this, you can ignore this email.</p>
      <p>— Shalean Cleaning Services</p>
    `,
  });

  if (sendErr) {
    await reportOperationalIssue("warn", "auth/password_reset", sendErr.message, { email });
    return { ok: false, reason: "email_failed" };
  }

  await logSystemEvent({
    level: "info",
    source: "auth/password_reset",
    message: "password_reset_email_sent",
    context: { email, channel: "resend" },
  });

  return { ok: true, channel: "resend" };
}
