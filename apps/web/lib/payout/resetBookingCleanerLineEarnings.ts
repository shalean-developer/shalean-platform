import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Clears derived display/line earnings + pending ledger so {@link persistCleanerPayoutIfUnset} can recompute. */
export async function resetBookingCleanerLineEarnings(admin: SupabaseClient, bookingId: string): Promise<void> {
  const bid = bookingId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(bid)) return;

  await admin
    .from("bookings")
    .update({
      display_earnings_cents: null,
      cleaner_earnings_total_cents: null,
      cleaner_line_earnings_finalized_at: null,
    })
    .eq("id", bid);

  await admin.from("booking_line_items").update({ cleaner_earnings_cents: null }).eq("booking_id", bid);

  await admin.from("cleaner_earnings").delete().eq("booking_id", bid).eq("status", "pending");
}
