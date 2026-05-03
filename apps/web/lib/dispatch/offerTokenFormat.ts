/** UUID v4 shape for `dispatch_offers.offer_token` — safe for client + server (no `server-only` deps). */
const OFFER_TOKEN_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidOfferTokenFormat(token: string): boolean {
  return OFFER_TOKEN_UUID.test(String(token ?? "").trim());
}
