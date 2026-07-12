/** Strip obvious PII keys before attaching crash extras. Pure — safe for node:test. */
export function sanitizeExtras(input: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set([
    "email",
    "phone",
    "password",
    "token",
    "accessToken",
    "refreshToken",
    "authorization",
    "card",
    "cvv",
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (blocked.has(k.toLowerCase())) continue;
    if (typeof v === "string" && v.length > 500) {
      out[k] = `${v.slice(0, 500)}…`;
      continue;
    }
    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}
