import "server-only";

const DEFAULT_LINE_SHARE = 0.7;

/**
 * Optional env override for line share (0–1). Prefer tenure-based
 * {@link resolveTenureBasedCleanerShareForBookingRow} on `bookings.cleaner_share_percentage`.
 */
export function resolveCleanerLineEarningsShare(): number {
  const raw = process.env.CLEANER_LINE_EARNINGS_SHARE?.trim();
  if (!raw) return DEFAULT_LINE_SHARE;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return DEFAULT_LINE_SHARE;
  return n;
}
