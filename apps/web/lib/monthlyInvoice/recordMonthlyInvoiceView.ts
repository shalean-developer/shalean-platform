import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Increment view stats when a customer opens the public pay link page. */
export async function recordMonthlyInvoiceView(invoiceId: string): Promise<void> {
  const id = invoiceId.trim();
  if (!id) return;

  const admin = getSupabaseAdmin();
  if (!admin) return;

  const { error } = await admin.rpc("record_monthly_invoice_view", { invoice_id: id });
  if (error) {
    console.error("[recordMonthlyInvoiceView]", error.message);
  }
}
