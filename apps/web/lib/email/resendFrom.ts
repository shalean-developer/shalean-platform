import { Resend } from "resend";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

const RESEND_FROM_FALLBACK = "Shalean Cleaning <onboarding@resend.dev>";
const RESEND_KEY_PATTERN = /^re_[A-Za-z0-9_]+$/;

function stripEnvValue(raw: string | null | undefined): string {
  if (raw == null) return "";

  let value = String(raw).trim().replace(/^\uFEFF/, "");
  if (!value) return "";

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  return value;
}

/** Strip whitespace / accidental quotes from env (common on Windows .env.local). */
export function resolveResendApiKey(): string | null {
  const raw = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
  const key = stripEnvValue(raw);
  if (!key) return null;
  if (!RESEND_KEY_PATTERN.test(key)) return null;
  return key;
}

/** Non-secret fingerprint for ops logs when Resend rejects a key. */
export function resendApiKeyFingerprint(key: string | null | undefined): string | null {
  const resolved = key ? stripEnvValue(key) : resolveResendApiKey();
  if (!resolved) return null;
  return `${resolved.slice(0, 8)}…len${resolved.length}`;
}

/** Explain why Resend is unavailable (missing vs wrong-shaped env value). */
export function describeResendApiKeyMisconfig(): string {
  const raw = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
  const stripped = stripEnvValue(raw);
  if (!stripped) {
    return "RESEND_API_KEY not set";
  }
  if (!RESEND_KEY_PATTERN.test(stripped)) {
    const preview = stripped.slice(0, 8);
    return `RESEND_API_KEY is set but invalid (expected re_…, got ${preview}…). Update the production env var to a current key from resend.com/api-keys.`;
  }
  return "RESEND_API_KEY configuration error";
}

export function getResend(): Resend | null {
  const key = resolveResendApiKey();
  if (!key) return null;
  return new Resend(key);
}

/**
 * Resend rejects invalid `from` (422) unless value is `email@domain` or `Name <email@domain>`.
 * Strips accidental outer quotes from env (common with Vercel / Windows .env).
 */
function isValidResendFromAddress(value: string): boolean {
  const plainEmail = /^[^\s<>]+@[^\s<>]+$/;
  const angleEmail = /<[^\s<>]+@[^\s<>]+>/;
  return plainEmail.test(value) || angleEmail.test(value);
}

function resolveResendFromAddress(): string {
  const fromCombined = stripEnvValue(process.env.RESEND_FROM);
  if (fromCombined && isValidResendFromAddress(fromCombined)) {
    return fromCombined;
  }

  const fromEmail = stripEnvValue(process.env.RESEND_FROM_EMAIL);
  const fromName = stripEnvValue(process.env.RESEND_FROM_NAME);
  if (fromEmail) {
    const legacy = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
    if (isValidResendFromAddress(legacy)) return legacy;
  }

  if (fromCombined) {
    void reportOperationalIssue("warn", "resendFrom", "RESEND_FROM is not a valid Resend from address; using onboarding@resend.dev fallback", {
      hint: "Use: you@verified.domain.com or Brand <you@verified.domain.com>",
      preview: fromCombined.slice(0, 120),
    });
  }

  return RESEND_FROM_FALLBACK;
}

export function getDefaultFromAddress(): string {
  return resolveResendFromAddress();
}
