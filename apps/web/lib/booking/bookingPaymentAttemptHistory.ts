/**
 * Lightweight audit of abandoned / replaced Paystack attempts on the booking row.
 * Stored inside `booking_snapshot` so no migration is required.
 */

export type BookingPaymentAttemptHistoryEntry = {
  reference: string;
  authorization_url?: string | null;
  created_at: string;
  superseded_at: string;
  reason: string;
};

const HISTORY_KEY = "payment_attempt_history";
const MAX_HISTORY = 20;

export function readPaymentAttemptHistory(snapshot: unknown): BookingPaymentAttemptHistoryEntry[] {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [];
  const raw = (snapshot as Record<string, unknown>)[HISTORY_KEY];
  if (!Array.isArray(raw)) return [];
  const out: BookingPaymentAttemptHistoryEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const reference = typeof rec.reference === "string" ? rec.reference.trim() : "";
    if (!reference) continue;
    out.push({
      reference,
      authorization_url: typeof rec.authorization_url === "string" ? rec.authorization_url : null,
      created_at: typeof rec.created_at === "string" ? rec.created_at : "",
      superseded_at: typeof rec.superseded_at === "string" ? rec.superseded_at : "",
      reason: typeof rec.reason === "string" ? rec.reason : "",
    });
  }
  return out;
}

export function appendPaymentAttemptHistory(
  snapshot: unknown,
  entry: BookingPaymentAttemptHistoryEntry,
): Record<string, unknown> {
  const base =
    snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? { ...(snapshot as Record<string, unknown>) }
      : { v: 1 };
  const prev = readPaymentAttemptHistory(base);
  const next = [...prev.filter((p) => p.reference !== entry.reference), entry].slice(-MAX_HISTORY);
  return { ...base, [HISTORY_KEY]: next };
}

export function referenceAllowedForBookingAccess(
  currentReference: string,
  providedReference: string,
  snapshot: unknown,
): boolean {
  const a = currentReference.trim().toLowerCase();
  const b = providedReference.trim().toLowerCase();
  if (!b) return false;
  if (a && a === b) return true;
  return readPaymentAttemptHistory(snapshot).some((h) => h.reference.trim().toLowerCase() === b);
}
