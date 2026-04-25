const TEAM_FIXED_EARNINGS_CENTS = 25_000;

function toCentsOrNull(value: unknown): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const cents = Math.max(0, Math.round(Number(value)));
  return cents;
}

export function resolveDisplayEarningsCents(
  booking: {
    id?: string | null;
    is_team_job?: boolean | null;
    display_earnings_cents?: number | null;
    cleaner_payout_cents?: number | null;
  },
  source: string,
): number | null {
  const display = toCentsOrNull(booking.display_earnings_cents);
  if (display != null) return display;

  if (booking.is_team_job === true) return TEAM_FIXED_EARNINGS_CENTS;

  const fallback = toCentsOrNull(booking.cleaner_payout_cents);
  if (fallback != null) {
    console.warn("Fallback earnings used", booking.id ?? "unknown", source);
    return fallback;
  }

  return null;
}

