import "server-only";

import crypto from "crypto";

/** Stable service slug for idempotency (must match admin POST body `service`). */
export function adminBookingServiceSlug(serviceRaw: string): string {
  return serviceRaw.trim().toLowerCase();
}

/** Read slug from persisted booking snapshot (admin monthly, Paystack locked, or future rows). */
export function serviceSlugFromBookingSnapshot(snap: unknown): string | null {
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return null;
  const o = snap as { service_slug?: string; locked?: { service?: string } };
  if (typeof o.service_slug === "string" && o.service_slug.trim()) return o.service_slug.trim().toLowerCase();
  if (typeof o.locked?.service === "string" && o.locked.service.trim()) return o.locked.service.trim().toLowerCase();
  return null;
}

function normalizeStreetToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/\broad\b/g, "rd")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\blane\b/g, "ln")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull likely SA postal codes (4 digits) from free text. */
function extractZaPostcodes(text: string): string {
  const matches = text.match(/\b(\d{4})\b/g);
  return matches?.length ? [...new Set(matches)].sort().join(" ") : "";
}

/**
 * Non-reversible fingerprint: normalized first line + second line (suburb/area) + postcodes in full text.
 * Light abbreviation normalization on street tokens (Main Road vs Main Rd).
 */
export function adminBookingLocationFingerprint(location: string): string {
  const raw = location.trim();
  if (!raw) {
    return crypto.createHash("sha256").update("", "utf8").digest("hex").slice(0, 32);
  }
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const line1 = normalizeStreetToken(lines[0] ?? "");
  const line2 = normalizeStreetToken(lines[1] ?? "");
  const postcodes = extractZaPostcodes(raw);
  const material = [line1, line2, postcodes].filter(Boolean).join(" | ");
  return crypto.createHash("sha256").update(material, "utf8").digest("hex").slice(0, 32);
}
