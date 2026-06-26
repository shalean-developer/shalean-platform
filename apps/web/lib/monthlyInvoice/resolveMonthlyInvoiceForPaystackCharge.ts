import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseMonthlyInvoiceIdFromPaystackReference } from "@/lib/monthlyInvoice/monthlyInvoicePaystackReference";

export type MonthlyInvoicePaymentRow = {
  id: string;
  status: string | null;
  total_amount_cents: number | null;
  amount_paid_cents: number | null;
  balance_cents: number | null;
  paystack_reference: string | null;
};

const PAYMENT_SELECT =
  "id, status, total_amount_cents, amount_paid_cents, balance_cents, paystack_reference";

export async function resolveMonthlyInvoiceForPaystackCharge(
  admin: SupabaseClient,
  params: { reference: string; invoiceIdHint?: string | null },
): Promise<MonthlyInvoicePaymentRow | null> {
  const ref = params.reference.trim();
  if (!ref) return null;

  const { data: byStoredRef, error: byRefErr } = await admin
    .from("monthly_invoices")
    .select(PAYMENT_SELECT)
    .eq("paystack_reference", ref)
    .maybeSingle();
  if (byRefErr) throw new Error(byRefErr.message);
  if (byStoredRef && typeof (byStoredRef as { id?: string }).id === "string") {
    return byStoredRef as MonthlyInvoicePaymentRow;
  }

  const idHints = new Set<string>();
  const fromRef = parseMonthlyInvoiceIdFromPaystackReference(ref);
  if (fromRef) idHints.add(fromRef);
  const hint = params.invoiceIdHint?.trim();
  if (hint && /^[0-9a-f-]{36}$/i.test(hint)) idHints.add(hint);

  for (const id of idHints) {
    const { data, error } = await admin
      .from("monthly_invoices")
      .select(PAYMENT_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data && typeof (data as { id?: string }).id === "string") {
      return data as MonthlyInvoicePaymentRow;
    }
  }

  return null;
}
