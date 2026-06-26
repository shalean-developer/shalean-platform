import "server-only";

export const SALES_DOC_PAYSTACK_REF_PREFIX = "sd_inv_";

export function salesDocumentPaystackReference(documentId: string): string {
  return `${SALES_DOC_PAYSTACK_REF_PREFIX}${documentId.trim()}`;
}

export function parseSalesDocumentIdFromPaystackReference(reference: string): string | null {
  const trimmed = reference.trim();
  if (!trimmed.toLowerCase().startsWith(SALES_DOC_PAYSTACK_REF_PREFIX)) return null;
  const id = trimmed.slice(SALES_DOC_PAYSTACK_REF_PREFIX.length);
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export function salesDocumentPaystackReferencesMatch(
  documentId: string,
  storedReference: string | null | undefined,
  chargeReference: string,
): boolean {
  const charge = chargeReference.trim().toLowerCase();
  if (!charge) return false;
  const stored = String(storedReference ?? "").trim().toLowerCase();
  if (stored && stored === charge) return true;
  return salesDocumentPaystackReference(documentId).toLowerCase() === charge;
}

export function salesDocumentIdFromPaystackMetadata(
  metadata: Record<string, unknown> | undefined,
): string | null {
  const raw = metadata?.shalean_sales_document_id;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export function isSalesDocumentPaystackReference(reference: string): boolean {
  return parseSalesDocumentIdFromPaystackReference(reference) !== null;
}
