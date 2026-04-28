import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseAdjustmentCategory, type AdjustmentCategory } from "@/lib/monthlyInvoice/adjustmentCategory";

/**
 * Inserts a credit/charge line for `month_applied` (`YYYY-MM`).
 * Draft: picked up by `recompute_monthly_invoice_totals`.
 * Sent / partially_paid / overdue: DB trigger bumps `total_amount_cents` immediately (see migration `invoice_adjustments_after_insert_route`).
 * If that calendar month is already **paid**, use a **future** `month_applied` so the next open draft absorbs it.
 */
export async function insertInvoiceAdjustment(
  admin: SupabaseClient,
  params: {
    customerId: string;
    amountCents: number;
    reason: string;
    monthApplied: string;
    createdBy?: string | null;
    category?: AdjustmentCategory;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const month = params.monthApplied.trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { ok: false, error: "invalid_month_applied" };
  }

  const category = parseAdjustmentCategory(params.category);

  const { data, error } = await admin
    .from("invoice_adjustments")
    .insert({
      customer_id: params.customerId,
      amount_cents: Math.round(params.amountCents),
      reason: params.reason.trim().slice(0, 2000),
      month_applied: month,
      created_by: params.createdBy ?? null,
      category,
    })
    .select("id")
    .maybeSingle();

  if (error || !data || typeof (data as { id?: string }).id !== "string") {
    return { ok: false, error: error?.message ?? "insert_failed" };
  }
  return { ok: true, id: (data as { id: string }).id };
}
