import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanerStatusIsManuallyUnavailable, normalizeCleanerStatus } from "@/lib/cleaner/cleanerStatus";

const CLEANER_ACTIVE_BOOKING_STATUSES = ["in_progress"] as const;

function collectUuid(id: unknown): string | null {
  const s = typeof id === "string" ? id.trim() : "";
  return /^[0-9a-f-]{36}$/i.test(s) ? s : null;
}

export async function loadCleanerIdsLinkedToBooking(
  supabase: SupabaseClient,
  bookingId: string,
  seed?: { cleaner_id?: string | null; payout_owner_cleaner_id?: string | null },
): Promise<string[]> {
  const out = new Set<string>();
  const add = (id: unknown) => {
    const u = collectUuid(id);
    if (u) out.add(u);
  };
  add(seed?.cleaner_id);
  add(seed?.payout_owner_cleaner_id);
  const { data: roster } = await supabase.from("booking_cleaners").select("cleaner_id").eq("booking_id", bookingId);
  for (const row of roster ?? []) add((row as { cleaner_id?: string | null }).cleaner_id);
  if (!seed?.cleaner_id && !seed?.payout_owner_cleaner_id) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("cleaner_id, payout_owner_cleaner_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (booking && typeof booking === "object") {
      add((booking as { cleaner_id?: string | null }).cleaner_id);
      add((booking as { payout_owner_cleaner_id?: string | null }).payout_owner_cleaner_id);
    }
  }
  return [...out];
}

async function cleanerHasActiveWorkloadBookings(supabase: SupabaseClient, cleanerId: string): Promise<boolean> {
  const { data: asAssignee } = await supabase.from("bookings").select("id").eq("cleaner_id", cleanerId).in("status", [...CLEANER_ACTIVE_BOOKING_STATUSES]).limit(1);
  if ((asAssignee?.length ?? 0) > 0) return true;
  const { data: asPayoutOwner } = await supabase.from("bookings").select("id").eq("payout_owner_cleaner_id", cleanerId).in("status", [...CLEANER_ACTIVE_BOOKING_STATUSES]).limit(1);
  if ((asPayoutOwner?.length ?? 0) > 0) return true;
  const { data: rosterRows } = await supabase.from("booking_cleaners").select("booking_id").eq("cleaner_id", cleanerId).limit(100);
  const bookingIds = (rosterRows ?? []).map((r) => collectUuid((r as { booking_id?: string | null }).booking_id)).filter((id): id is string => id != null);
  if (bookingIds.length === 0) return false;
  const { data: rosterActive } = await supabase.from("bookings").select("id").in("id", bookingIds).in("status", [...CLEANER_ACTIVE_BOOKING_STATUSES]).limit(1);
  return (rosterActive?.length ?? 0) > 0;
}

export async function syncCleanerBusyFromBookings(supabase: SupabaseClient, cleanerId: string): Promise<void> {
  const { data: row } = await supabase.from("cleaners").select("status").eq("id", cleanerId).maybeSingle();
  const raw = row && typeof row === "object" ? String((row as { status?: string }).status ?? "") : "";
  const current = normalizeCleanerStatus(raw);
  if (cleanerStatusIsManuallyUnavailable(current)) return;
  const busy = await cleanerHasActiveWorkloadBookings(supabase, cleanerId);
  const next = busy ? "busy" : "available";
  if (current === next) return;
  await supabase.from("cleaners").update({ status: next }).eq("id", cleanerId);
}

const BOOKING_TERMINAL_WORKLOAD_STATUSES = new Set(["completed", "cancelled", "failed"]);
export function isBookingTerminalForCleanerWorkloadSync(status: string | null | undefined): boolean {
  return BOOKING_TERMINAL_WORKLOAD_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

function collectCleanerIdsForWorkloadSync(cleanerIds: Iterable<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const raw of cleanerIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (id && /^[0-9a-f-]{36}$/i.test(id)) out.add(id);
  }
  return [...out];
}

export async function syncCleanersBusyAfterBookingTerminalChange(supabase: SupabaseClient, cleanerIds: Iterable<string | null | undefined>): Promise<void> {
  const ids = collectCleanerIdsForWorkloadSync(cleanerIds);
  await Promise.all(ids.map((id) => syncCleanerBusyFromBookings(supabase, id)));
}

export async function syncCleanersBusyAfterBookingTerminalByBookingId(
  supabase: SupabaseClient,
  bookingId: string,
  seed?: { cleaner_id?: string | null; payout_owner_cleaner_id?: string | null },
): Promise<void> {
  const ids = await loadCleanerIdsLinkedToBooking(supabase, bookingId, seed);
  await syncCleanersBusyAfterBookingTerminalChange(supabase, ids);
}
