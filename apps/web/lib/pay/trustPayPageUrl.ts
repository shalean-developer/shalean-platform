/**
 * Branded `/pay/[bookingId]?ref=` URL (falls back to raw Paystack URL when app base is unset).
 */
export function trustPayPageUrl(bookingId: string, paystackReference: string, paystackAuthorizationUrl: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const id = bookingId.trim();
  const ref = paystackReference.trim();
  if (!base || !id || !ref) return paystackAuthorizationUrl;
  return `${base}/pay/${encodeURIComponent(id)}?ref=${encodeURIComponent(ref)}`;
}
