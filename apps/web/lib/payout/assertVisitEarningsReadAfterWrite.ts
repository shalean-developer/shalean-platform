import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadRosterByBookingIds,
  loadTeamJobMemberPayoutsByBookingIds,
  perCleanerAllocationsForBooking,
} from "@/lib/admin/payouts/officePayoutPeriodReport";

/**
 * Read-after-write: office/cleaner effective cents for `cleanerId` must equal the requested total.
 */
export async function assertVisitEarningsReadAfterWrite(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    cleanerId: string;
    expectedTotalCents: number;
  },
): Promise<{ ok: true; effectiveCents: number } | { ok: false; error: string; code: string; effectiveCents?: number }> {
  const bookingId = String(params.bookingId ?? "").trim();
  const cleanerId = String(params.cleanerId ?? "").trim();
  const expected = Math.max(0, Math.round(params.expectedTotalCents));
  if (!bookingId || !cleanerId) {
    return { ok: false, error: "Missing booking or cleaner id for read-after-write.", code: "raw_invalid_params" };
  }

  const { data: booking, error } = await admin
    .from("bookings")
    .select(
      "id, cleaner_id, payout_owner_cleaner_id, display_earnings_cents, cleaner_payout_cents, cleaner_bonus_cents, cleaner_earnings_total_cents, payout_frozen_cents, earnings_summary",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, code: "raw_booking_load_failed" };
  if (!booking) return { ok: false, error: "Booking not found after earnings update.", code: "raw_booking_not_found" };

  const rosterByBooking = await loadRosterByBookingIds(admin, [bookingId]);
  const teamByBooking = await loadTeamJobMemberPayoutsByBookingIds(admin, [bookingId]);
  const allocations = perCleanerAllocationsForBooking(
    booking as Parameters<typeof perCleanerAllocationsForBooking>[0],
    rosterByBooking.get(bookingId) ?? [],
    teamByBooking.get(bookingId),
  );
  const alloc = allocations.find((row) => row.cleaner_id === cleanerId);
  const effectiveCents = alloc ? Math.max(0, Math.round(alloc.cents)) : 0;

  if (effectiveCents !== expected) {
    return {
      ok: false,
      error: `Read-after-write failed: expected R${(expected / 100).toFixed(2)} for cleaner, found R${(effectiveCents / 100).toFixed(2)}.`,
      code: "read_after_write_mismatch",
      effectiveCents,
    };
  }

  return { ok: true, effectiveCents };
}
