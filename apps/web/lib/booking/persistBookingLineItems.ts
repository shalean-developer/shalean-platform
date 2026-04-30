import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingLineItemInsert, BookingLineItemRow } from "@/lib/booking/bookingLineItemTypes";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

/**
 * Best-effort Phase 1 dual-write: booking row already exists; failures are logged but do not roll back the booking.
 */
export async function persistBookingLineItems(
  admin: SupabaseClient,
  bookingId: string,
  items: readonly BookingLineItemInsert[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (items.length === 0) return { ok: true };

  const rows: BookingLineItemRow[] = items.map((r) => ({
    ...r,
    booking_id: bookingId,
    metadata: r.metadata ?? {},
  }));

  const { error } = await admin.from("booking_line_items").insert(rows);
  if (error) {
    void reportOperationalIssue("error", "persistBookingLineItems", error.message, {
      bookingId,
      count: rows.length,
    });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
