/**
 * HMAC secret for `POST /api/booking/lock` quote signatures (`lockQuoteSignature`).
 * In production, `BOOKING_LOCK_HMAC_SECRET` must be set. Local/dev may omit it and get a fixed dev fallback.
 */
const DEV_FALLBACK_SECRET = "dev-insecure-booking-lock-hmac-do-not-use-in-prod";

let devFallbackWarned = false;

export const CONFIG_MISSING_BOOKING_LOCK_HMAC = "CONFIG_MISSING_BOOKING_LOCK_HMAC" as const;

/**
 * Resolves the secret used for signing. Throws only in production when unset.
 */
export function resolveBookingLockHmacSecretForSigning(): string {
  const fromEnv = process.env.BOOKING_LOCK_HMAC_SECRET?.trim();
  if (fromEnv) return fromEnv;

  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    console.error("[booking] Missing BOOKING_LOCK_HMAC_SECRET (required in production for lock quote HMAC).");
    throw new Error(CONFIG_MISSING_BOOKING_LOCK_HMAC);
  }

  if (!devFallbackWarned) {
    console.warn(
      "[booking] BOOKING_LOCK_HMAC_SECRET unset — using a dev-only fallback. Set BOOKING_LOCK_HMAC_SECRET in .env.local and restart `npm run dev`.",
    );
    devFallbackWarned = true;
  }
  return DEV_FALLBACK_SECRET;
}
