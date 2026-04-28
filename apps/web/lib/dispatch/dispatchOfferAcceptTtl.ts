/**
 * How long a marketplace / admin dispatch offer stays `pending` (`dispatch_offers.expires_at`).
 * In-app copy: "Expires in … — accept now to secure this job".
 *
 * Override: `DISPATCH_OFFER_ACCEPT_TTL_SECONDS` (60–86400).
 */
export const DISPATCH_OFFER_ACCEPT_TTL_DEFAULT_SECONDS = 2 * 60 * 60;

export function resolveDispatchOfferAcceptTtlSeconds(): number {
  const raw = Number(process.env.DISPATCH_OFFER_ACCEPT_TTL_SECONDS?.trim());
  if (Number.isFinite(raw) && raw >= 60 && raw <= 24 * 60 * 60) {
    return Math.floor(raw);
  }
  return DISPATCH_OFFER_ACCEPT_TTL_DEFAULT_SECONDS;
}
