/** Normalize Paystack `metadata` (verify / webhook) to string values for `parseBookingSnapshot`. */
export function normalizePaystackMetadata(meta: unknown): Record<string, string | undefined> {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}
