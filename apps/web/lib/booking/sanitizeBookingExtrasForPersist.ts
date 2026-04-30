import { MAX_BOOKING_EXTRAS_ROWS } from "@/lib/booking/bookingExtrasLimits";
import { devWarn } from "@/lib/logging/devWarn";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export type BookingExtraPersistRow = { slug: string; name: string; price: number };

/**
 * Normalizes and caps extras written to `bookings.extras` (JSON array of `{ slug, name, price }`).
 * Drops invalid entries, dedupes by slug, and truncates if the payload is oversized.
 */
export function sanitizeBookingExtrasForPersist(
  rows: readonly unknown[],
  ctx?: { where?: string; bookingId?: string },
): BookingExtraPersistRow[] {
  const seen = new Set<string>();
  const out: BookingExtraPersistRow[] = [];
  let skippedInvalid = 0;
  let skippedDup = 0;

  for (const raw of rows) {
    let slug = "";
    let name = "";
    let priceNum = NaN;

    if (typeof raw === "string") {
      slug = raw.trim();
      name = slug;
      priceNum = 0;
    } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      slug = typeof o.slug === "string" ? o.slug.trim() : "";
      name = typeof o.name === "string" ? o.name.trim() : "";
      const p = o.price;
      priceNum = typeof p === "number" && Number.isFinite(p) ? p : Number(p);
    } else {
      skippedInvalid += 1;
      continue;
    }

    if (!slug) {
      skippedInvalid += 1;
      continue;
    }
    if (seen.has(slug)) {
      skippedDup += 1;
      continue;
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      skippedInvalid += 1;
      continue;
    }
    const price = Math.round(Math.min(priceNum, 500_000));

    seen.add(slug);
    out.push({ slug, name: name || slug, price });
    if (out.length >= MAX_BOOKING_EXTRAS_ROWS) break;
  }

  const truncated = rows.length > MAX_BOOKING_EXTRAS_ROWS || out.length < rows.length;
  const mutated = truncated || skippedInvalid > 0 || skippedDup > 0;

  if (mutated) {
    devWarn("[booking-extras] sanitized persist payload", {
      ...ctx,
      inputLen: rows.length,
      outputLen: out.length,
      skippedInvalid,
      skippedDup,
    });
    const droppedCount = Math.max(0, rows.length - out.length);
    void reportOperationalIssue(
      "warn",
      "sanitizeBookingExtrasForPersist",
      "booking_extras_sanitized",
      {
        errorType: "booking_extras_sanitized",
        where: ctx?.where ?? null,
        bookingId: ctx?.bookingId ?? null,
        inputLen: rows.length,
        outputLen: out.length,
        skippedInvalid,
        skippedDup,
        droppedCount,
      },
    );
  }

  return out;
}
