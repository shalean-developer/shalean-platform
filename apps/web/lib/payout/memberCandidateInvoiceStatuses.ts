import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingRowForWeeklyBatchEligibility } from "@/lib/payout/bookingPayableForWeeklyBatch";
import { payoutQueryChunks } from "@/lib/payout/payoutQueryPagination";

/**
 * Member payout candidates can reference monthly invoices that never appear in
 * the direct bookings.cleaner_id candidate set for the same cleaner. Preserve
 * any statuses already loaded by the caller and hydrate only missing invoice IDs.
 */
export async function hydrateMissingMemberInvoiceStatuses(
  admin: SupabaseClient,
  bookingRows: readonly (BookingRowForWeeklyBatchEligibility & { id?: string })[],
  invoiceStatusById: Map<string, string>,
): Promise<Map<string, string>> {
  const out = new Map(invoiceStatusById);
  const missing = [
    ...new Set(
      bookingRows
        .map((row) => String(row.monthly_invoice_id ?? "").trim())
        .filter((id) => id && !out.has(id)),
    ),
  ];

  if (!missing.length) return out;

  for (const idChunk of payoutQueryChunks(missing)) {
    const { data, error } = await admin.from("monthly_invoices").select("id, status").in("id", idChunk);
    if (error) {
      throw new Error(`member monthly_invoices lookup failed: ${error.message}`);
    }

    for (const raw of data ?? []) {
      const row = raw as { id?: string | null; status?: string | null };
      const id = String(row.id ?? "").trim();
      if (id) out.set(id, String(row.status ?? ""));
    }
  }

  return out;
}
