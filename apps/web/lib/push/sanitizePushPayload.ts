const ALLOWED_DATA_KEYS = new Set([
  "type",
  "path",
  "bookingId",
  "booking_id",
  "event",
  "screen",
]);

const FORBIDDEN_KEY_RE =
  /(password|token|secret|email|phone|address|card|cvv|ssn|id_number|otp|pin)/i;

/**
 * Strip sensitive fields from Expo `data` payloads. Only allowlisted keys survive.
 */
export function sanitizePushData(
  data: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (FORBIDDEN_KEY_RE.test(key)) continue;
    if (!ALLOWED_DATA_KEYS.has(key)) continue;
    if (typeof value === "string") {
      out[key] = value.slice(0, 200);
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

export function sanitizePushTitleBody(title: string, body: string): { title: string; body: string } {
  return {
    title: title.trim().slice(0, 80) || "Shalean",
    body: body.trim().slice(0, 240) || "You have a new update.",
  };
}
