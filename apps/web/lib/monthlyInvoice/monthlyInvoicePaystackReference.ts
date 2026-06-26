import "server-only";

export const MONTHLY_INVOICE_PAYSTACK_REF_PREFIX = "mi_inv_";

export function parseMonthlyInvoiceIdFromPaystackReference(reference: string): string | null {
  const m = /^mi_inv_([0-9a-f-]{36})/i.exec(reference.trim());
  return m?.[1] ?? null;
}

export function monthlyInvoicePaystackReferencesMatch(
  invoiceId: string,
  storedReference: string | null | undefined,
  chargeReference: string,
): boolean {
  const charge = chargeReference.trim().toLowerCase();
  if (!charge) return false;
  const stored = String(storedReference ?? "").trim().toLowerCase();
  if (stored && stored === charge) return true;
  const parsedId = parseMonthlyInvoiceIdFromPaystackReference(chargeReference);
  return parsedId != null && parsedId.toLowerCase() === invoiceId.trim().toLowerCase();
}

export function monthlyInvoiceIdFromPaystackMetadata(
  metadata: Record<string, unknown> | undefined,
): string | null {
  const raw = metadata?.shalean_monthly_invoice_id;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export function isMonthlyInvoicePaystackReference(reference: string): boolean {
  return parseMonthlyInvoiceIdFromPaystackReference(reference) !== null;
}
