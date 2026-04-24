import { Resend } from "resend";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

const RESEND_FROM_FALLBACK = "Shalean Cleaning <onboarding@resend.dev>";

export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

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

  void reportOperationalIssue("warn", "resendFrom", "RESEND_FROM is not a valid Resend from address; using onboarding@resend.dev fallback", {
    hint: "Use: you@verified.domain.com or Brand <you@verified.domain.com>",
    preview: s.slice(0, 120),
  });
  return RESEND_FROM_FALLBACK;
}

export function getDefaultFromAddress(): string {
  return resolveResendFromAddress();
}
