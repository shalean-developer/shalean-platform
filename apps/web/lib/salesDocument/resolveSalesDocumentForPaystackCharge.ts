import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  parseSalesDocumentIdFromPaystackReference,
  salesDocumentPaystackReference,
} from "@/lib/salesDocument/salesDocumentPaystackReference";

export type SalesDocumentPaymentRow = {
  id: string;
  status: string | null;
  document_type: string;
  total_cents: number | null;
  amount_paid_cents: number | null;
  balance_cents: number | null;
  zoho_invoice_id: string | null;
  customer_email: string;
  customer_name: string;
  paystack_reference: string | null;
};

const PAYMENT_SELECT =
  "id, status, document_type, total_cents, amount_paid_cents, balance_cents, zoho_invoice_id, customer_email, customer_name, paystack_reference";

export async function resolveSalesDocumentForPaystackCharge(
  admin: SupabaseClient,
  params: { reference: string; documentIdHint?: string | null },
): Promise<SalesDocumentPaymentRow | null> {
  const ref = params.reference.trim();
  if (!ref) return null;

  const { data: byStoredRef, error: byRefErr } = await admin
    .from("sales_documents")
    .select(PAYMENT_SELECT)
    .eq("paystack_reference", ref)
    .maybeSingle();
  if (byRefErr) throw new Error(byRefErr.message);
  if (byStoredRef && typeof (byStoredRef as { id?: string }).id === "string") {
    return byStoredRef as SalesDocumentPaymentRow;
  }

  const idHints = new Set<string>();
  const fromRef = parseSalesDocumentIdFromPaystackReference(ref);
  if (fromRef) idHints.add(fromRef);
  const hint = params.documentIdHint?.trim();
  if (hint && /^[0-9a-f-]{36}$/i.test(hint)) idHints.add(hint);

  for (const id of idHints) {
    const { data, error } = await admin.from("sales_documents").select(PAYMENT_SELECT).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (data && typeof (data as { id?: string }).id === "string") {
      return data as SalesDocumentPaymentRow;
    }
  }

  return null;
}

export function canonicalSalesDocumentPaystackReference(documentId: string): string {
  return salesDocumentPaystackReference(documentId);
}
