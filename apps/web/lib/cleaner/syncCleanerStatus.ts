import type { SupabaseClient } from "@supabase/supabase-js";

/** Sets cleaner to busy if they have assigned/in_progress jobs, else available (when not offline). */
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
  if (st === "offline") return;

  const { data: active } = await supabase
    .from("bookings")
    .select("id")
    .eq("cleaner_id", cleanerId)
    .in("status", ["assigned", "in_progress"])
    .limit(10);

  const busy = (active?.length ?? 0) > 0;
  await supabase.from("cleaners").update({ status: busy ? "busy" : "available" }).eq("id", cleanerId);
}
