import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { parseAdjustmentCategory, type AdjustmentCategory } from "@/lib/monthlyInvoice/adjustmentCategory";
import {
  appendBookingRefToReason,
  isMissingInvoiceAdjustmentBookingIdColumn,
} from "@/lib/monthlyInvoice/invoiceAdjustmentBookingRef";

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
    bookingId?: string | null;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const month = params.monthApplied.trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { ok: false, error: "invalid_month_applied" };
  }

  const category = parseAdjustmentCategory(params.category);
  const bookingId = typeof params.bookingId === "string" && params.bookingId.trim() ? params.bookingId.trim() : null;
  const reason = bookingId
    ? appendBookingRefToReason(params.reason, bookingId)
    : params.reason.trim().slice(0, 2000);

  const baseRow = {
    customer_id: params.customerId,
    amount_cents: Math.round(params.amountCents),
    reason,
    month_applied: month,
    created_by: params.createdBy ?? null,
    category,
  };

  if (bookingId) {
    const withBooking = { ...baseRow, booking_id: bookingId };
    const linked = await admin.from("invoice_adjustments").insert(withBooking).select("id").maybeSingle();
    if (!linked.error && linked.data && typeof (linked.data as { id?: string }).id === "string") {
      return { ok: true, id: (linked.data as { id: string }).id };
    }
    if (!isMissingInvoiceAdjustmentBookingIdColumn(linked.error)) {
      return { ok: false, error: linked.error?.message ?? "insert_failed" };
    }
  }

  const { data, error } = await admin.from("invoice_adjustments").insert(baseRow).select("id").maybeSingle();

  if (error || !data || typeof (data as { id?: string }).id !== "string") {
    return { ok: false, error: error?.message ?? "insert_failed" };
  }
  return { ok: true, id: (data as { id: string }).id };
}
