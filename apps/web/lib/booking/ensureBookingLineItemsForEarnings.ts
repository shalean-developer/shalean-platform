import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildBookingLineItemsFromRow,
  type BookingRowLineItemBackfillInput,
} from "@/lib/booking/buildBookingLineItemsFromRow";
import { persistBookingLineItems } from "@/lib/booking/persistBookingLineItems";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

/**
 * When `booking_line_items` were never dual-written at checkout, earnings allocation
 * (`computeCleanerEarningsForBooking`) skips with `no_line_items` while `display_earnings_cents`
 * may still persist from booking totals. Backfill lines from the same snapshot/totals used by
 * offline scripts so paid solo jobs get a durable line basis.
 */
export async function ensureBookingLineItemsForEarningsIfMissing(
  admin: SupabaseClient,
  bookingId: string,
  opts?: { isTeamJob?: boolean | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const bid = bookingId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(bid)) return { ok: false, error: "Invalid booking id" };
  if (opts?.isTeamJob === true) return { ok: true };

  const { count, error: cErr } = await admin
    .from("booking_line_items")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bid);
  if (cErr) return { ok: false, error: cErr.message };
  if ((count ?? 0) > 0) return { ok: true };

  const { data: row, error: rErr } = await admin
    .from("bookings")
    .select("id, service, rooms, bathrooms, extras, total_paid_zar, amount_paid_cents, booking_snapshot, is_team_job")
    .eq("id", bid)
    .maybeSingle();
  if (rErr || !row) return { ok: false, error: rErr?.message ?? "Booking not found" };
  if ((row as { is_team_job?: boolean | null }).is_team_job === true) return { ok: true };

  const items = buildBookingLineItemsFromRow(row as BookingRowLineItemBackfillInput);
  if (items.length === 0) return { ok: true };

  const persisted = await persistBookingLineItems(admin, bid, items);
  if (!persisted.ok) {
    void reportOperationalIssue("error", "ensureBookingLineItemsForEarningsIfMissing", persisted.error, {
      bookingId: bid,
    });
    return { ok: false, error: persisted.error };
  }
  void logSystemEvent({
    level: "info",
    source: "ensureBookingLineItemsForEarningsIfMissing",
    message: "backfilled_booking_line_items",
    context: { bookingId: bid, count: items.length },
  });
  return { ok: true };
}
