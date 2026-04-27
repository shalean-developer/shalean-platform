/**
 * Base URL for SMS offer links (`{base}/offer/{token}`).
 * Prefer NEXT_PUBLIC_APP_URL in dev/preview; production SMS defaults to www.shalean.com.
 */
export function getOfferSmsLinkBaseUrl(): string {
  const explicit = process.env.OFFER_SMS_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  return "https://www.shalean.com";
}
