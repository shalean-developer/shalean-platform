import { resolveBookingWideCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import type { BookingEarningsPreview } from "@/lib/admin/buildBookingEarningsPreview";

/** Compare booking-wide totals; a paired header display is only the lead basis. */
export function bookingEarningsPreviewComparison(preview: BookingEarningsPreview | null) {
  if (!preview?.computed_preview) return null;
  const projectedTotalCents = preview.computed_preview.total_cleaner_earnings_cents;
  const stored = preview.current.earnings_summary;
  const noHeaderBasis = preview.current.display_earnings_cents == null && preview.current.cleaner_earnings_total_cents == null;
  if (!stored && noHeaderBasis) return null;
  const bookingWide = resolveBookingWideCleanerEarningsCents(preview.current);
  const hasParticipantSummary = stored && (preview.current.is_team_job || stored.cleaner_count > 1 || noHeaderBasis);
  const currentTotalCents = hasParticipantSummary
    ? stored.total_cleaner_earnings_cents
    : bookingWide.cleaner_cost_cents;
  if (currentTotalCents == null || !Number.isSafeInteger(currentTotalCents) || !Number.isSafeInteger(projectedTotalCents)) return null;
  return { currentTotalCents, projectedTotalCents, diffCents: projectedTotalCents - currentTotalCents };
}
