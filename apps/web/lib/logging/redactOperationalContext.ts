const REDACTED = "[redacted]";

function redactPhoneLike(value: unknown): string {
  if (typeof value !== "string") return REDACTED;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return REDACTED;
  return `phone_tail:${digits.slice(-4)}`;
}

/**
 * Shallow redaction for stderr and external alert webhooks. Full-context rows may still be persisted to `system_logs`
 * for authorized admin review; this prevents accidental PII/metadata dumps to host logs and Slack-style hooks.
 */
export function redactOperationalContext(
  context?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!context || typeof context !== "object") return context;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    const k = key.toLowerCase();

    if (
      k === "email" ||
      k.endsWith("_email") ||
      k.includes("customer_email") ||
      k === "customeremail" ||
      k === "to"
    ) {
      out[key] = REDACTED;
      continue;
    }

    if (k.includes("phone") || k.includes("whatsapp")) {
      out[key] = redactPhoneLike(value);
      continue;
    }

    if (
      k.includes("authorization") ||
      k === "paystack_authorization_code" ||
      k.includes("authorization_code")
    ) {
      out[key] = REDACTED;
      continue;
    }

    if (
      k === "booking_json" ||
      k === "booking_snapshot" ||
      k === "price_snapshot" ||
      k === "metadata" ||
      k === "paystackmetadata" ||
      k === "payload" ||
      k === "snapshot" ||
      k === "gateway_response" ||
      k === "customer_name" ||
      k === "customername" ||
      k === "location" ||
      k === "address"
    ) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        out[key] = { _redacted: true, keys: Object.keys(value as object).slice(0, 48) };
      } else if (typeof value === "string" && value.length > 160) {
        out[key] = `${value.slice(0, 80)}…[truncated]`;
      } else {
        out[key] = REDACTED;
      }
      continue;
    }

    out[key] = value;
  }
  return out;
}
