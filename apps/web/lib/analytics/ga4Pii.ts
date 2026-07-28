/**
 * Strip personally identifiable information before any GA4 / dataLayer payload leaves the browser.
 * Never send names, emails, phones, street addresses, booking notes, or free-text customer fields.
 */

const BLOCKED_KEY_EXACT = new Set([
  "email",
  "e-mail",
  "mail",
  "phone",
  "telephone",
  "mobile",
  "cell",
  "name",
  "first_name",
  "last_name",
  "firstname",
  "lastname",
  "full_name",
  "customer_name",
  "customer_email",
  "customer_phone",
  "address",
  "street",
  "street_address",
  "address_line1",
  "address_line2",
  "line1",
  "line2",
  "city_address",
  "postal_code",
  "postcode",
  "zip",
  "notes",
  "booking_notes",
  "customer_notes",
  "special_requests",
  "instructions",
  "access_notes",
  "user_email",
  "user_phone",
  "user_name",
]);

const BLOCKED_KEY_SUBSTRINGS = [
  "email",
  "phone",
  "mobile",
  "address",
  "street",
  "postal",
  "firstname",
  "lastname",
  "full_name",
  "customer_name",
  "booking_note",
  "special_request",
  "password",
  "id_number",
  "national_id",
] as const;

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
/** SA / E.164-ish phone patterns in free text */
const PHONE_RE = /(?:\+?27|0)\s?\d[\d\s\-()]{7,14}\d/;

function isBlockedKey(key: string): boolean {
  const k = key.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (BLOCKED_KEY_EXACT.has(k)) return true;
  return BLOCKED_KEY_SUBSTRINGS.some((s) => k.includes(s));
}

function scrubString(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (EMAIL_RE.test(trimmed) || PHONE_RE.test(trimmed)) return null;
  // Cap free-text length so notes cannot slip through under a benign key
  if (trimmed.length > 120) return trimmed.slice(0, 120);
  return trimmed;
}

function scrubValue(value: unknown, depth: number): unknown {
  if (depth > 4) return undefined;
  if (value == null) return undefined;
  if (typeof value === "string") {
    const scrubbed = scrubString(value);
    return scrubbed === null ? undefined : scrubbed;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .map((v) => scrubValue(v, depth + 1))
      .filter((v) => v !== undefined && v !== null);
  }
  if (typeof value === "object") {
    return sanitizeGa4Params(value as Record<string, unknown>, depth + 1);
  }
  return undefined;
}

/**
 * Returns a GA4-safe params object. Blocked keys are dropped; string values that look
 * like email/phone are dropped.
 */
export function sanitizeGa4Params(
  params: Record<string, unknown> | null | undefined,
  depth = 0,
): Record<string, unknown> {
  if (!params || typeof params !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(params)) {
    if (isBlockedKey(key)) continue;
    const scrubbed = scrubValue(raw, depth);
    if (scrubbed === undefined) continue;
    out[key] = scrubbed;
  }
  return out;
}

/** True if any key or string value looks like PII (for tests / guards). */
export function ga4ParamsContainPii(params: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(params)) {
    if (isBlockedKey(key)) return true;
    if (typeof value === "string" && (EMAIL_RE.test(value) || PHONE_RE.test(value))) return true;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (ga4ParamsContainPii(value as Record<string, unknown>)) return true;
    }
  }
  return false;
}
