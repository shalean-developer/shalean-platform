/**
 * Booking id helpers for logs, API payloads, and admin views.
 * Prefer `parseTrimmedBookingId` when you need the canonical value (single `.trim()` pass).
 */

/** Nominal brand — avoids accidental `string` widening better than a string `__brand` field. */
declare const bookingIdBrand: unique symbol;

/** Opaque nominal type: use only values from `parseTrimmedBookingId` / `extractBookingIdFromLogContext`. */
export type BookingId = string & {
  readonly [bookingIdBrand]: true;
};

/** Single trim pass; returns canonical id or `null`. */
export function parseTrimmedBookingId(v: unknown): BookingId | null {
  if (typeof v !== "string") return null;
  const cleaned = v.trim();
  if (cleaned.length === 0) return null;
  return cleaned as BookingId;
}

/** True when `v` yields a non-empty trimmed string (prefer `parseTrimmedBookingId` for the value). */
export function isValidBookingId(v: unknown): boolean {
  return parseTrimmedBookingId(v) !== null;
}

/**
 * `context.bookingId` or first `context.bookingIds[]` when present (e.g. `system_logs.context`).
 * Only the first list entry is considered; see `normalizeBookingIdsArray` if you need the full list cleaned.
 */
export function extractBookingIdFromLogContext(ctx: unknown): BookingId | null {
  if (!ctx || typeof ctx !== "object") return null;
  const c = ctx as Record<string, unknown>;
  const fromId = parseTrimmedBookingId(c.bookingId);
  if (fromId) return fromId;
  if (Array.isArray(c.bookingIds)) return parseTrimmedBookingId(c.bookingIds[0]);
  return null;
}

/**
 * Trim + drop empties (order preserved). Does not assert UUID shape.
 * Handy if callers start persisting a cleaned `bookingIds` array; timeline extraction still uses `[0]` only.
 */
export function normalizeBookingIdsArray(ids: unknown): Readonly<BookingId[]> {
  if (!Array.isArray(ids)) {
    const empty: BookingId[] = [];
    return Object.freeze(empty);
  }
  const out: BookingId[] = [];
  for (const el of ids) {
    const id = parseTrimmedBookingId(el);
    if (id) out.push(id);
  }
  return Object.freeze(out);
}
