const SENSITIVE_KEY_PATTERN =
  /(email|phone|address|name|token|password|secret|key|authorization|cookie|customer|cleaner_id|booking_id|user_id|reference|supabase|service_role|refresh|access_token|project_ref)/i;

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /\b(?:\+?27|0)\d[\d\s-]{7,}\b/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-]+/gi;

export const OFFICE_AUDIT_PROHIBITED_FIELDS = [
  "customer names",
  "customer emails",
  "phone numbers",
  "addresses",
  "booking IDs",
  "cleaner IDs",
  "access tokens",
  "refresh tokens",
  "Supabase keys",
  "project references",
  "service-role credentials",
  "payment references",
] as const;

export function redactString(value: string): string {
  return value
    .replace(BEARER_RE, "Bearer [REDACTED]")
    .replace(EMAIL_RE, "[REDACTED_EMAIL]")
    .replace(UUID_RE, "[REDACTED_ID]")
    .replace(PHONE_RE, "[REDACTED_PHONE]");
}

export function redactAuditValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => redactAuditValue(v));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = "[REDACTED]";
        continue;
      }
      out[k] = redactAuditValue(v);
    }
    return out;
  }
  return String(value);
}

export function assertNoSensitiveLeak(payload: unknown): void {
  const text = JSON.stringify(payload);
  if (!text) return;
  if (EMAIL_RE.test(text) || /Bearer\s+[A-Za-z0-9._\-]{20,}/i.test(text) || /service_role|eyJhbGciOi/i.test(text)) {
    throw new Error("Audit report redaction failed: sensitive material detected");
  }
}
