import type { SupabaseClient } from "@supabase/supabase-js";

const CLEANER_ACTIVE_BOOKING_STATUSES = ["assigned", "in_progress"] as const;

function collectUuid(id: unknown): string | null {
  const s = typeof id === "string" ? id.trim() : "";
  return /^[0-9a-f-]{36}$/i.test(s) ? s : null;
}

/** All cleaner ids tied to a booking row (assignee, payout owner, roster). */
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
  for (const row of roster ?? []) {
    add((row as { cleaner_id?: string | null }).cleaner_id);
  }

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
  const { data: asAssignee } = await supabase
    .from("bookings")
    .select("id")
    .eq("cleaner_id", cleanerId)
    .in("status", [...CLEANER_ACTIVE_BOOKING_STATUSES])
    .limit(1);
  if ((asAssignee?.length ?? 0) > 0) return true;

  const { data: asPayoutOwner } = await supabase
    .from("bookings")
    .select("id")
    .eq("payout_owner_cleaner_id", cleanerId)
    .in("status", [...CLEANER_ACTIVE_BOOKING_STATUSES])
    .limit(1);
  if ((asPayoutOwner?.length ?? 0) > 0) return true;

  const { data: rosterRows } = await supabase
    .from("booking_cleaners")
    .select("booking_id")
    .eq("cleaner_id", cleanerId)
    .limit(100);
  const bookingIds = (rosterRows ?? [])
    .map((r) => collectUuid((r as { booking_id?: string | null }).booking_id))
    .filter((id): id is string => id != null);
  if (bookingIds.length === 0) return false;

  const { data: rosterActive } = await supabase
    .from("bookings")
    .select("id")
    .in("id", bookingIds)
    .in("status", [...CLEANER_ACTIVE_BOOKING_STATUSES])
    .limit(1);
  return (rosterActive?.length ?? 0) > 0;
}

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

  const busy = await cleanerHasActiveWorkloadBookings(supabase, cleanerId);
  const next = busy ? "busy" : "available";
  if (st === next) return;

  await supabase.from("cleaners").update({ status: next }).eq("id", cleanerId);
}

/** Booking terminal states that should release workload (`busy` → `available`). */
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

/**
 * Recompute workload status for every cleaner tied to a booking after it
 * completes, cancels, or fails. Safe to call with null/duplicate ids.
 */
export async function syncCleanersBusyAfterBookingTerminalChange(
  supabase: SupabaseClient,
  cleanerIds: Iterable<string | null | undefined>,
): Promise<void> {
  const ids = collectCleanerIdsForWorkloadSync(cleanerIds);
  await Promise.all(ids.map((id) => syncCleanerBusyFromBookings(supabase, id)));
}

/** After a booking reaches a terminal status, sync every cleaner linked to that booking. */
export async function syncCleanersBusyAfterBookingTerminalByBookingId(
  supabase: SupabaseClient,
  bookingId: string,
  seed?: { cleaner_id?: string | null; payout_owner_cleaner_id?: string | null },
): Promise<void> {
  const ids = await loadCleanerIdsLinkedToBooking(supabase, bookingId, seed);
  await syncCleanersBusyAfterBookingTerminalChange(supabase, ids);
}
