import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  getPasswordResetRedirectBase,
  passwordResetRedirectIsProductionLeak,
} from "@/lib/auth/passwordResetRedirect";
import { getDefaultFromAddress, getResend } from "@/lib/email/resendFrom";
import {
  applyOutboundSubjectPrefix,
  decideOutboundEmail,
} from "@/lib/env/outboundMessagingSafety";
import { isNonProductionDeployment, outboundTestMessageMarker } from "@/lib/env/deploymentEnvironment";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { customerNameFromEmail } from "@/lib/templates/bookingEmailTemplateData";

export type SendPasswordResetEmailResult =
  | { ok: true; channel: "resend" | "supabase"; redirectTo: string }
  | {
      ok: false;
      reason: "no_user" | "link_failed" | "email_failed" | "config" | "production_redirect" | "rate_limited";
    };

/**
 * Password reset is auth-critical. When staging marketing outbound is fully disabled,
 * still allow Resend delivery with a visible staging marker so operators can recover access.
 * Allowlist denials and missing config still fall through to the Supabase Auth mailer.
 */
function decidePasswordResetOutbound(email: string): {
  allowed: boolean;
  subjectPrefix: string | null;
  reason: string | null;
} {
  const decision = decideOutboundEmail(email);
  if (decision.allowed) {
    return { allowed: true, subjectPrefix: decision.subjectPrefix, reason: null };
  }
  if (
    decision.reason === "outbound_messaging_disabled" &&
    isNonProductionDeployment() &&
    getResend()
  ) {
    return {
      allowed: true,
      subjectPrefix: outboundTestMessageMarker(),
      reason: "auth_critical_outbound_exception",
    };
  }
  return { allowed: false, subjectPrefix: null, reason: decision.reason };
}

function isMissingUserError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("user not found") || m.includes("not found") || m.includes("no user");
}

function isRateLimitedError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("only request this after") || m.includes("rate limit") || m.includes("too many");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readMetaFullName(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const fn = typeof m.full_name === "string" ? m.full_name.trim() : "";
  if (fn) return fn;
  const n = typeof m.name === "string" ? String(m.name).trim() : "";
  return n || null;
}

async function resolvePasswordResetGreetingName(
  admin: SupabaseClient,
  email: string,
  userId?: string | null,
  userMetadata?: unknown,
): Promise<string> {
  if (userId) {
    const { data: profile } = await admin
      .from("user_profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    const fromProfile = String((profile as { full_name?: string | null } | null)?.full_name ?? "").trim();
    if (fromProfile) return customerNameFromEmail(email, fromProfile);
  }
  return customerNameFromEmail(email, readMetaFullName(userMetadata));
}

/**
 * Delivers a password recovery email.
 *
 * Prefer Resend + `generateLink` (custom HTML, staging-safe redirect).
 * Otherwise use Supabase `resetPasswordForEmail` alone — never both in one request
 * (double-hit triggers Auth rate limits → false 502s).
 */
export async function sendPasswordResetEmail(
  admin: SupabaseClient,
  rawEmail: string,
): Promise<SendPasswordResetEmailResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, reason: "no_user" };
  }

  const redirectTo = `${getPasswordResetRedirectBase()}/auth/reset-password`;
  if (passwordResetRedirectIsProductionLeak(redirectTo)) {
    await reportOperationalIssue(
      "error",
      "auth/password_reset",
      "Refusing password reset redirect to production from non-production deployment",
      { email, redirectTo },
    );
    return { ok: false, reason: "production_redirect" };
  }

  const outbound = decidePasswordResetOutbound(email);
  const resend = getResend();

  if (resend && outbound.allowed) {
    const { data, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (linkErr) {
      if (isMissingUserError(linkErr.message)) {
        return { ok: false, reason: "no_user" };
      }
      if (isRateLimitedError(linkErr.message)) {
        return { ok: false, reason: "rate_limited" };
      }
      await reportOperationalIssue("warn", "auth/password_reset", `generateLink: ${linkErr.message}`, { email });
      return { ok: false, reason: "link_failed" };
    }

    const actionLink = String(data?.properties?.action_link ?? "").trim();
    if (!actionLink) {
      await reportOperationalIssue("warn", "auth/password_reset", "generateLink returned no action_link", {
        email,
      });
      return { ok: false, reason: "link_failed" };
    }
    if (passwordResetRedirectIsProductionLeak(actionLink)) {
      await reportOperationalIssue(
        "error",
        "auth/password_reset",
        "Supabase recovery action_link targets production from non-production deployment",
        { email },
      );
      return { ok: false, reason: "production_redirect" };
    }

    const user = data?.user;
    const greet = escapeHtml(
      await resolvePasswordResetGreetingName(admin, email, user?.id ?? null, user?.user_metadata),
    );
    const subject = applyOutboundSubjectPrefix("Reset your Shalean password", outbound.subjectPrefix);

    const { error: sendErr } = await resend.emails.send({
      from: getDefaultFromAddress(),
      to: email,
      subject,
      html: `
      <p>Hi ${greet},</p>
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
      context: {
        email,
        channel: "resend",
        redirectTo,
        outboundReason: outbound.reason,
      },
    });

    return { ok: true, channel: "resend", redirectTo };
  }

  // Single-path Supabase Auth mailer (do not call generateLink first — rate-limit collision).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, reason: "config" };

  const pub = createClient(url, anon, { auth: { persistSession: false } });
  const { error: fallbackErr } = await pub.auth.resetPasswordForEmail(email, { redirectTo });
  if (fallbackErr) {
    if (isMissingUserError(fallbackErr.message)) {
      return { ok: false, reason: "no_user" };
    }
    if (isRateLimitedError(fallbackErr.message)) {
      return { ok: false, reason: "rate_limited" };
    }
    await reportOperationalIssue("warn", "auth/password_reset", `supabase mailer: ${fallbackErr.message}`, {
      email,
      outboundReason: outbound.reason,
    });
    return { ok: false, reason: "email_failed" };
  }

  await logSystemEvent({
    level: "info",
    source: "auth/password_reset",
    message: "password_reset_email_sent",
    context: {
      email,
      channel: "supabase",
      redirectTo,
      outboundReason: outbound.reason,
    },
  });

  return { ok: true, channel: "supabase", redirectTo };
}
