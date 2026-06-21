import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { lastScheduledVisitYmd } from "@/lib/monthlyInvoice/isMonthlyInvoiceReadyToFinalize";
import { lastDayYmdOfInvoiceMonth } from "@/lib/recurring/johannesburgCalendar";

/**
 * Draft invoices: `due_date` tracks the last scheduled visit in the billing month
 * (provisional until finalize stamps payment due = today).
 */
export async function refreshDraftMonthlyInvoiceDueDate(
  admin: SupabaseClient,
  invoiceId: string,
): Promise<{ ok: true; dueDateYmd: string | null; changed: boolean } | { ok: false; error: string }> {
  const { data: inv, error: invErr } = await admin
    .from("monthly_invoices")
    .select("id, month, status, due_date")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) return { ok: false, error: invErr.message };
  const row = inv as { id: string; month: string; status: string | null; due_date: string | null } | null;
  if (!row || String(row.status ?? "").toLowerCase() !== "draft") {
    return { ok: true, dueDateYmd: null, changed: false };
  }

  const month = String(row.month ?? "").trim();
  const { data: bookings, error: bkErr } = await admin
    .from("bookings")
    .select("date")
    .eq("monthly_invoice_id", invoiceId)
    .neq("status", "cancelled");

  if (bkErr) return { ok: false, error: bkErr.message };

  const dates = (bookings ?? []).map((b) => String((b as { date: string }).date));
  const dueDateYmd = lastScheduledVisitYmd(month, dates) ?? lastDayYmdOfInvoiceMonth(month);
  const stored = String(row.due_date ?? "").slice(0, 10);
  if (stored === dueDateYmd) {
    return { ok: true, dueDateYmd, changed: false };
  }

  const { error: upErr } = await admin
    .from("monthly_invoices")
    .update({ due_date: dueDateYmd })
    .eq("id", invoiceId)
    .eq("status", "draft");

  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true, dueDateYmd, changed: true };
}
