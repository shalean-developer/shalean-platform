/** Max recovery waves for user-selected offer (decline / TTL expiry → re-dispatch). Env: `MAX_DISPATCH_ATTEMPTS` (1–20). */
export function maxDispatchAttempts(): number {
  const n = Number(process.env.MAX_DISPATCH_ATTEMPTS);
  if (Number.isFinite(n) && n >= 1 && n <= 20) return Math.round(n);
  return 5;
}

/**
 * Hard cap on total `dispatch_offers` rows per booking before auto-dispatch stops (manual ops).
 * Env `DISPATCH_MAX_OFFERS_PER_BOOKING` (1–50). Stop when `count >` this value (default 5 → allows 6 rows before cap).
 */
export function maxDispatchOffersPerBooking(): number {
  const n = Number(process.env.DISPATCH_MAX_OFFERS_PER_BOOKING);
  if (Number.isFinite(n) && n >= 1 && n <= 50) return Math.round(n);
  return 5;
}
