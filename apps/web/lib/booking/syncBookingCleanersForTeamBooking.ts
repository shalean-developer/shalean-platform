import type { SupabaseClient } from "@supabase/supabase-js";

const RETRY_MS = [0, 80, 200];

/**
 * Rebuilds `booking_cleaners` from `team_members` for a team job (dual-write / repair).
 * No-op when `is_team_job` is false or `team_id` is null.
 * Retries a few times on transient failures.
 */
export async function syncBookingCleanersForTeamBooking(
  admin: SupabaseClient,
  bookingId: string,
  source: "admin" | "dispatch" | "sync" = "sync",
): Promise<{ ok: true } | { ok: false; message: string }> {
  let lastMessage = "unknown";
  for (let i = 0; i < RETRY_MS.length; i++) {
    const delay = RETRY_MS[i] ?? 0;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    const { error } = await admin.rpc("sync_booking_cleaners_for_team_booking", {
      p_booking_id: bookingId,
      p_source: source,
    });
    if (!error) return { ok: true };
    lastMessage = error.message;
  }
  return { ok: false, message: lastMessage };
}
