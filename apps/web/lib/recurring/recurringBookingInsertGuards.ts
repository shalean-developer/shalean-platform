import "server-only";

/**
 * Recurring occurrence inserts vs other booking types:
 *
 * - **Recurring-generated** (`recurring_id` = plan id, `is_recurring_generated` = true): Pay-per recurring
 *   path and monthly fixed-schedule path both set these on insert.
 * - **Manual / pay-per one-off** (`recurring_id` null, `is_recurring_generated` false): admin or checkout rows.
 *
 * Duplicate **skip** is only when this plan already has a row for the same calendar date (`recurring_id` + `date`),
 * matching `bookings_recurring_service_date_uidx`. Admin bookings on the same date do **not** satisfy that and
 * must not block generation; slot collisions with `idx_bookings_unique_active_customer_slot` are handled in
 * `insertRecurringOccurrenceBooking` / `insertMonthlyRecurringOccurrenceBooking` via `slot_duplicate_exempt` retry.
 */

import { terminalStatusesNotInDuplicateProbe } from "@/lib/booking/bookingTerminalStatuses";
import type { SupabaseClient } from "@supabase/supabase-js";

/** DB unique `bookings_recurring_service_date_uidx` — one row per plan + calendar date. */
export async function recurringPlanOccurrenceRowExists(
  admin: SupabaseClient,
  recurringId: string,
  dateYmd: string,
): Promise<boolean> {
  const { data } = await admin
    .from("bookings")
    .select("id")
    .eq("recurring_id", recurringId)
    .eq("date", dateYmd)
    .maybeSingle();
  return Boolean(data && typeof data === "object" && "id" in data);
}

/**
 * First active (non-terminal) booking in the same customer slot as `idx_bookings_unique_active_customer_slot`.
 * Used to detect admin/manual rows that caused 23505 so we can retry with `slot_duplicate_exempt`.
 */
export async function findActiveCustomerSlotOccupant(
  admin: SupabaseClient,
  p: { userId: string; dateYmd: string; time: string | null | undefined; serviceSlug: string },
): Promise<{ id: string; recurring_id: string | null } | null> {
  let q = admin
    .from("bookings")
    .select("id, recurring_id")
    .eq("user_id", p.userId)
    .eq("date", p.dateYmd)
    .eq("service_slug", p.serviceSlug)
    .not("status", "in", terminalStatusesNotInDuplicateProbe());
  const t = p.time != null && String(p.time).trim() !== "" ? String(p.time).trim() : null;
  if (t === null) q = q.is("time", null);
  else q = q.eq("time", t);
  const { data } = await q.maybeSingle();
  if (!data || typeof data !== "object" || !("id" in data)) return null;
  return {
    id: String((data as { id: string }).id),
    recurring_id: (data as { recurring_id?: string | null }).recurring_id ?? null,
  };
}
