import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import type { PreferredDispatchStatus } from "@/lib/dispatch/preferredCleanerDispatchPolicy";

export async function setPreferredDispatchStatus(
  supabase: SupabaseClient,
  bookingId: string,
  status: PreferredDispatchStatus,
): Promise<void> {
  const { error } = await supabase.from("bookings").update({ preferred_dispatch_status: status }).eq("id", bookingId);
  if (error) {
    await logSystemEvent({
      level: "warn",
      source: "preferred_cleaner_dispatch",
      message: `set preferred_dispatch_status failed: ${error.message}`,
      context: { bookingId, status },
    });
  }
}

export async function finalizePreferredDispatchOnOfferAccept(
  supabase: SupabaseClient,
  params: { bookingId: string; cleanerId: string; offerType: string | null | undefined },
): Promise<void> {
  const offerType = String(params.offerType ?? "").trim().toLowerCase();
  if (offerType === "preferred") {
    await setPreferredDispatchStatus(supabase, params.bookingId, "preferred_cleaner_accepted");
    return;
  }
  if (offerType === "backup") {
    await setPreferredDispatchStatus(supabase, params.bookingId, "assigned_to_backup_cleaner");
  }
}

export async function markPreferredOfferExpiredOnBooking(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<void> {
  await setPreferredDispatchStatus(supabase, bookingId, "preferred_cleaner_expired");
}
