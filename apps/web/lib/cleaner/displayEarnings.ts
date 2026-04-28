function toCentsOrNull(value: unknown): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const cents = Math.max(0, Math.round(Number(value)));
  return cents;
}

export type ResolveDisplayEarningsResult = {
  cents: number | null;
  isEstimate: boolean;
  lowEstimateCents?: number | null;
  highEstimateCents?: number | null;
};

export type ResolveDisplayEarningsBooking = {
  id?: string | null;
  is_team_job?: boolean | null;
  display_earnings_cents?: number | null;
  cleaner_payout_cents?: number | null;
};

export function resolveDisplayEarnings(booking: ResolveDisplayEarningsBooking): ResolveDisplayEarningsResult {
  const display = toCentsOrNull(booking.display_earnings_cents);
  if (display != null) return { cents: display, isEstimate: false };

  const fallback = toCentsOrNull(booking.cleaner_payout_cents);
  if (fallback != null) return { cents: fallback, isEstimate: false };

  return { cents: null, isEstimate: false };
}

export function resolveDisplayEarningsCents(booking: ResolveDisplayEarningsBooking, _source?: string): number | null {
  return resolveDisplayEarnings(booking).cents;
}
