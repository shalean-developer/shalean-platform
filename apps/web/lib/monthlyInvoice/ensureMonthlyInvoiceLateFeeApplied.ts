import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { insertInvoiceAdjustment } from "@/lib/monthlyInvoice/insertInvoiceAdjustment";
import {
  formatMonthlyInvoiceLateFeeZar,
  monthlyInvoiceLateFeeCentsForInvoiceTotal,
  shouldApplyMonthlyInvoiceLateFee,
} from "@/lib/monthlyInvoice/monthlyInvoiceLateFeePolicy";
import { todayJohannesburg } from "@/lib/recurring/johannesburgCalendar";

type InvoiceRow = {
  id: string;
  customer_id: string;
  month: string;
  due_date: string | null;
  status: string | null;
  total_amount_cents: number | null;
};

/**
 * Idempotently adds a percentage-based late fee when payment is collected after
 * the grace window. Clears a stale Paystack link so the next init uses the new balance.
 */
export async function ensureMonthlyInvoiceLateFeeApplied(
  admin: SupabaseClient,
  invoiceId: string,
  todayYmd: string = todayJohannesburg(),
): Promise<
  | { ok: true; applied: false; reason: "not_due" | "already_applied" | "not_payable" }
  | { ok: true; applied: true; amountCents: number }
  | { ok: false; error: string }
> {
  const { data: inv, error: invErr } = await admin
    .from("monthly_invoices")
    .select("id, customer_id, month, due_date, status, total_amount_cents")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) return { ok: false, error: invErr.message };
  const row = inv as InvoiceRow | null;
  if (!row) return { ok: false, error: "invoice_not_found" };

  const status = String(row.status ?? "").toLowerCase();
  if (!["sent", "partially_paid", "overdue"].includes(status)) {
    return { ok: true, applied: false, reason: "not_payable" };
  }

  if (!shouldApplyMonthlyInvoiceLateFee(row.due_date, todayYmd)) {
    return { ok: true, applied: false, reason: "not_due" };
  }

  const { data: existing, error: existErr } = await admin
    .from("invoice_adjustments")
    .select("id")
    .eq("applied_to_invoice_id", row.id)
    .eq("category", "late_fee")
    .limit(1);

  if (existErr) return { ok: false, error: existErr.message };
  if ((existing ?? []).length > 0) {
    return { ok: true, applied: false, reason: "already_applied" };
  }

  const amountCents = monthlyInvoiceLateFeeCentsForInvoiceTotal(Number(row.total_amount_cents ?? 0));
  const insert = await insertInvoiceAdjustment(admin, {
    customerId: row.customer_id,
    amountCents,
    reason: `Late payment fee — 5% (R ${formatMonthlyInvoiceLateFeeZar(amountCents)})`,
    monthApplied: row.month,
    category: "late_fee",
  });

  if (!insert.ok) return { ok: false, error: insert.error };

  await admin
    .from("monthly_invoices")
    .update({ payment_link: null })
    .eq("id", row.id)
    .in("status", ["sent", "partially_paid", "overdue"]);

  return { ok: true, applied: true, amountCents };
}
