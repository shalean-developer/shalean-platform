import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * When the last pending dispatch offer for a booking is gone (expired/rejected/accepted elsewhere),
 * surface `dispatch_status = expired` on the booking for admin/cleaner UI — only while the row is still dispatchable.
 */
export async function syncBookingDispatchExpiredWhenNoPendingOffers(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<void> {
  const bid = bookingId.trim();
  if (!bid) return;

  const { count, error: cErr } = await supabase
    .from("dispatch_offers")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bid)
    .eq("status", "pending");
  if (cErr) return;
  if ((count ?? 0) > 0) return;

  const { data: head, error: hErr } = await supabase
    .from("bookings")
    .select("status, dispatch_status")
    .eq("id", bid)
    .maybeSingle();
  if (hErr || !head) return;

  const st = String((head as { status?: string | null }).status ?? "").toLowerCase();
  const ds = String((head as { dispatch_status?: string | null }).dispatch_status ?? "").toLowerCase();
  if (st !== "offered" && st !== "pending" && st !== "pending_assignment") return;
  if (ds === "assigned" || ds === "expired") return;

  await supabase.from("bookings").update({ dispatch_status: "expired" }).eq("id", bid);
}
