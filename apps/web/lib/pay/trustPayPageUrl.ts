import { getPublicAppUrlBase } from "@/lib/email/appUrl";

/**
 * Branded `/pay/[bookingId]?ref=` URL (falls back to raw Paystack URL when app base is unset).
 */
export function trustPayPageUrl(bookingId: string, paystackReference: string, paystackAuthorizationUrl: string): string {
  const base = getPublicAppUrlBase();
  const id = bookingId.trim();
  const ref = paystackReference.trim();
  if (!id || !ref) return paystackAuthorizationUrl;
  return `${base}/pay/${encodeURIComponent(id)}?ref=${encodeURIComponent(ref)}`;
}
