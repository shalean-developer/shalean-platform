import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Clears stored Paystack authorization URL so the next initialize / landing load
 * creates a checkout for the current remaining balance (BILL-INV-002 Phase A).
 */
export async function clearMonthlyInvoicePaymentLink(
  admin: SupabaseClient,
  invoiceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = invoiceId.trim();
  if (!id) return { ok: false, error: "missing_invoice_id" };

  const { error } = await admin
    .from("monthly_invoices")
    .update({ payment_link: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["draft", "sent", "partially_paid", "overdue"]);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
