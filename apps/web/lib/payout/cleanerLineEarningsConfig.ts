import "server-only";

import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { FALLBACK_LINE_CLEANER_SHARE, parseStoredCleanerSharePercentage } from "@/lib/payout/tenureBasedCleanerLineShare";

export { resolveCleanerLineEarningsShare } from "@/lib/payout/cleanerLineEarningsShareEnv";

/**
 * Parse stored `cleaner_share_percentage` only. Invalid/missing returns fallback with warn
 * (prefer {@link resolveEffectiveLineCleanerSharePercentageForBooking} for recompute paths).
 */
export function bookingCleanerShareOrFallback(
  raw: unknown,
  opts: { bookingId: string; logSource: string },
): number {
  const parsed = parseStoredCleanerSharePercentage(raw);
  if (parsed != null) return parsed;
  void reportOperationalIssue("warn", opts.logSource, "Invalid or missing cleaner_share_percentage — using fallback", {
    bookingId: opts.bookingId,
    raw,
  });
  return FALLBACK_LINE_CLEANER_SHARE;
}
