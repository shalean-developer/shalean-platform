import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingUsesAccrualPayoutCap } from "@/lib/payout/bookingPayoutCapCents";
import type { BookingRowForWeeklyBatchEligibility } from "@/lib/payout/bookingPayableForWeeklyBatch";
import { payoutQueryChunks } from "@/lib/payout/payoutQueryPagination";

/** Member-only visits may reference invoices absent from the direct-cleaner map. */
export async function loadMemberPayoutInvoiceStatuses(
  admin: SupabaseClient,
  bookings: readonly BookingRowForWeeklyBatchEligibility[],
  knownStatuses: Map<string, string>,
): Promise<Map<string, string>> {
  const statuses = new Map(knownStatuses);
  const ids = [...new Set(bookings.filter(bookingUsesAccrualPayoutCap)
    .map((row) => String(row.monthly_invoice_id ?? "").trim())
    .filter((id) => id && !statuses.has(id)))];
  for (const chunk of payoutQueryChunks(ids)) {
    const { data, error } = await admin.from("monthly_invoices").select("id, status").in("id", chunk);
    if (error) throw new Error(`Member payout invoice lookup failed: ${error.message}`);
    for (const row of data ?? []) statuses.set(String(row.id), String(row.status ?? ""));
  }
  return statuses;
}
