import type { BookingEarningsPreview } from "@/lib/admin/buildBookingEarningsPreview";

/** Compare booking-wide totals; a paired header display is only the lead basis. */
export function bookingEarningsPreviewComparison(preview: BookingEarningsPreview | null) {
  if (!preview?.computed_preview) return null;
  const projectedTotalCents = preview.computed_preview.total_cleaner_earnings_cents;
  const currentTotalCents = preview.current.earnings_summary?.total_cleaner_earnings_cents
    ?? preview.current.cleaner_earnings_total_cents
    ?? preview.current.display_earnings_cents;
  if (currentTotalCents == null || !Number.isSafeInteger(currentTotalCents) || !Number.isSafeInteger(projectedTotalCents)) return null;
  return { currentTotalCents, projectedTotalCents, diffCents: projectedTotalCents - currentTotalCents };
}
