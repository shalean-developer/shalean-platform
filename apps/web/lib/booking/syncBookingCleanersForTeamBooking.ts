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

const MAX_TEAM_JOBS_RESYNC = 400;

/**
 * After `team_members` changes, rebuild `booking_cleaners` for each non-finalized team job on this team.
 * Sequential RPCs — capped — so roster rows match membership (adds/removals).
 */
export async function resyncBookingCleanersForTeamNonFinalizedJobs(
  admin: SupabaseClient,
  teamId: string,
  source: "admin" | "dispatch" | "sync" = "admin",
): Promise<{ synced: number; failed: number }> {
  const tid = teamId.trim();
  if (!tid) return { synced: 0, failed: 0 };

  const { data: rows, error } = await admin
    .from("bookings")
    .select("id")
    .eq("team_id", tid)
    .eq("is_team_job", true)
    .is("cleaner_line_earnings_finalized_at", null)
    .limit(MAX_TEAM_JOBS_RESYNC);

  if (error || !rows?.length) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  for (const r of rows) {
    const id = String((r as { id?: string }).id ?? "").trim();
    if (!id) continue;
    const out = await syncBookingCleanersForTeamBooking(admin, id, source);
    if (out.ok) synced++;
    else failed++;
  }
  return { synced, failed };
}
