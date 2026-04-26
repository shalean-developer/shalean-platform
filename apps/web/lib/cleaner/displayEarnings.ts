const TEAM_FIXED_EARNINGS_CENTS = 25_000;

function toCentsOrNull(value: unknown): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const cents = Math.max(0, Math.round(Number(value)));
  return cents;
}

export type ResolveDisplayEarningsResult = {
  cents: number | null;
  /**
   * True when a team job had no stored `display_earnings_cents` and the fixed member placeholder was used.
   * UI should label as estimated, not guaranteed final pay.
   */
  isEstimate: boolean;
  /** Future: range estimates e.g. dynamic team pricing — optional cents band. */
  lowEstimateCents?: number | null;
  highEstimateCents?: number | null;
};

export type ResolveDisplayEarningsBooking = {
  id?: string | null;
  is_team_job?: boolean | null;
  display_earnings_cents?: number | null;
  cleaner_payout_cents?: number | null;
};

export function resolveDisplayEarnings(booking: ResolveDisplayEarningsBooking, source: string): ResolveDisplayEarningsResult {
  const display = toCentsOrNull(booking.display_earnings_cents);
  if (display != null) return { cents: display, isEstimate: false };

  if (booking.is_team_job === true) {
    return { cents: TEAM_FIXED_EARNINGS_CENTS, isEstimate: true };
  }

  const fallback = toCentsOrNull(booking.cleaner_payout_cents);
  if (fallback != null) {
    console.warn("Fallback earnings used", booking.id ?? "unknown", source);
    return { cents: fallback, isEstimate: false };
  }

  return { cents: null, isEstimate: false };
}

export function resolveDisplayEarningsCents(booking: ResolveDisplayEarningsBooking, source: string): number | null {
  return resolveDisplayEarnings(booking, source).cents;
}
