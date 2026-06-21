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

/** Branded public document view URL. */
export function trustDocPageUrl(documentId: string, publicToken: string): string {
  const base = getPublicAppUrlBase();
  const id = documentId.trim();
  const token = publicToken.trim();
  if (!id || !token) return base || "";
  return `${base}/doc/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`;
}

/** Branded sales-document pay landing (mirrors booking `/pay/[id]?ref=`). */
export function trustSalesDocPayPageUrl(
  documentId: string,
  paystackReference: string,
  paystackAuthorizationUrl: string,
): string {
  const base = getPublicAppUrlBase();
  const id = documentId.trim();
  const ref = paystackReference.trim();
  if (!id || !ref) return paystackAuthorizationUrl;
  return `${base}/pay/doc/${encodeURIComponent(id)}?ref=${encodeURIComponent(ref)}`;
}

/** Branded monthly-invoice pay landing. */
export function trustMonthlyInvoicePayPageUrl(
  invoiceId: string,
  paystackReference: string,
  paystackAuthorizationUrl: string,
): string {
  const base = getPublicAppUrlBase();
  const id = invoiceId.trim();
  const ref = paystackReference.trim();
  if (!id || !ref) return paystackAuthorizationUrl;
  return `${base}/pay/invoice/${encodeURIComponent(id)}?ref=${encodeURIComponent(ref)}`;
}
