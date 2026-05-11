import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Workload sync. Recomputes `cleaners.status` from live booking rows so the
 * dashboard / dispatch eligibility filter reflect actual workload after an
 * accept / start / complete / cancel.
 *
 * Invariants:
 *  - `cleaners.is_available` is the cleaner's manual willingness flag and is
 *    NEVER written by this function. It is owned exclusively by the manual
 *    Go online / Go offline toggle (PATCH `/api/cleaner/me`).
 *  - When the cleaner is manually offline (`status === 'offline'`) we return
 *    early. Completing the last job MUST NOT silently force them back online;
 *    they have to opt in via the manual toggle.
 *  - Result is no-op-aware: if the derived workload status equals the
 *    current value we skip the UPDATE entirely so we don't churn
 *    `updated_at` (which downstream realtime subscribers can react to).
 */
export async function syncCleanerBusyFromBookings(
  supabase: SupabaseClient,
  cleanerId: string,
): Promise<void> {
  const { data: row } = await supabase
    .from("cleaners")
    .select("status")
    .eq("id", cleanerId)
    .maybeSingle();

  const st = row && typeof row === "object" ? String((row as { status?: string }).status ?? "") : "";
  // Manual offline is a hard guard — preserve it verbatim. Completing a job
  // when the cleaner went offline mid-shift must NOT bring them back online.
  if (st === "offline") return;

  const { data: active } = await supabase
    .from("bookings")
    .select("id")
    .eq("cleaner_id", cleanerId)
    .in("status", ["assigned", "in_progress"])
    .limit(10);

  const busy = (active?.length ?? 0) > 0;
  const next = busy ? "busy" : "available";
  if (st === next) return;

  await supabase.from("cleaners").update({ status: next }).eq("id", cleanerId);
}
