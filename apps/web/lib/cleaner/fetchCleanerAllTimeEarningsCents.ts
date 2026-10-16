import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchViewerPayoutByBookingIds } from "@/lib/cleaner/fetchViewerPayoutByBookingIds";
import { resolveCleanerDashboardEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { bookingHasActivePayoutAttributionRemoval } from "@/lib/payout/bookingPayoutAttributionRemoval";

const PAGE_SIZE = 500;
const ID_CHUNK_SIZE = 100;

export type CleanerAllTimeEarningsBookingRow = {
  id: string;
  date?: string | null;
  earnings_policy?: string | null;
  internal_earnings_cents?: number | null;
  booking_cleaners?: Array<{ cleaner_id:string }> | null;
  booking_roster_member_payouts?: Array<{cleaner_id:string;payout_cents:number;bonus_cents:number}> | null;
  cleaner_payout_cents?: number | null;
  cleaner_bonus_cents?: number | null;
  cleaner_id?: string | null;
  payout_owner_cleaner_id?: string | null;
  payout_frozen_cents?: number | null;
  display_earnings_cents?: number | null;
  cleaner_earnings_total_cents?: number | null;
  is_team_job?: boolean | null;
  earnings_summary?: unknown;
  metadata?: unknown;
};

const BOOKING_SELECT =
  "id, date, earnings_policy, internal_earnings_cents, booking_cleaners ( cleaner_id ), booking_roster_member_payouts ( cleaner_id, payout_cents, bonus_cents ), cleaner_payout_cents, cleaner_bonus_cents, cleaner_id, payout_owner_cleaner_id, payout_frozen_cents, display_earnings_cents, cleaner_earnings_total_cents, is_team_job, earnings_summary, metadata";

function chunks<T>(values: readonly T[], size = ID_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size) as T[]);
  return out;
}

async function fetchDirectCompletedBookings(
  admin: SupabaseClient,
  cleanerId: string,
): Promise<CleanerAllTimeEarningsBookingRow[]> {
  const rows: CleanerAllTimeEarningsBookingRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from("bookings")
      .select(BOOKING_SELECT)
      .or(`cleaner_id.eq.${cleanerId},payout_owner_cleaner_id.eq.${cleanerId}`)
      .eq("status", "completed")
      .eq("is_test", false)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as CleanerAllTimeEarningsBookingRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchRosterBookingIds(admin: SupabaseClient, cleanerId: string): Promise<string[]> {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin
      .from("booking_cleaners")
      .select("booking_id")
      .eq("cleaner_id", cleanerId)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as Array<{ booking_id?: string | null }>;
    for (const row of page) {
      const bookingId = String(row.booking_id ?? "").trim();
      if (bookingId) ids.add(bookingId);
    }
    if (page.length < PAGE_SIZE) break;
  }
  return [...ids];
}

async function fetchRosterCompletedBookings(
  admin: SupabaseClient,
  bookingIds: readonly string[],
): Promise<CleanerAllTimeEarningsBookingRow[]> {
  const rows: CleanerAllTimeEarningsBookingRow[] = [];
  for (const idChunk of chunks(bookingIds)) {
    const { data, error } = await admin
      .from("bookings")
      .select(BOOKING_SELECT)
      .in("id", idChunk)
      .eq("status", "completed")
      .eq("is_test", false);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as CleanerAllTimeEarningsBookingRow[]));
  }
  return rows;
}

async function fetchViewerPayoutsChunked(
  admin: SupabaseClient,
  cleanerId: string,
  bookingIds: readonly string[],
): Promise<Map<string, number>> {
  const merged = new Map<string, number>();
  for (const idChunk of chunks(bookingIds)) {
    const partial = await fetchViewerPayoutByBookingIds(admin, cleanerId, idChunk);
    for (const [bookingId, cents] of partial) merged.set(bookingId, cents);
  }
  return merged;
}

export function sumCleanerAllTimeEarningsFromRows(
  rows: readonly CleanerAllTimeEarningsBookingRow[],
  cleanerId: string,
  viewerPayoutByBooking: ReadonlyMap<string, number> = new Map(),
): number {
  const deduped = new Map<string, CleanerAllTimeEarningsBookingRow>();
  for (const row of rows) {
    const bookingId = String(row.id ?? "").trim();
    if (bookingId) deduped.set(bookingId, row);
  }

  let total = 0;
  for (const row of deduped.values()) {
    if (bookingHasActivePayoutAttributionRemoval(row)) continue;
    const viewerPayout = viewerPayoutByBooking.get(row.id);
    total += resolveCleanerDashboardEarningsCents(
      {
        ...row,
        viewer_payout_cents: viewerPayout ?? null,
      },
      cleanerId,
    );
  }
  return total;
}

/**
 * Booking-derived all-time cleaner earnings.
 *
 * This intentionally follows the same read precedence as the cleaner earnings
 * screen while the cleaner_earnings ledger remains a shadow/optional rail.
 * No financial rows are mutated.
 */
export async function fetchCleanerAllTimeEarningsCents(
  admin: SupabaseClient,
  cleanerId: string,
): Promise<number> {
  const cid = cleanerId.trim();
  if (!cid) return 0;

  const [directRows, rosterBookingIds] = await Promise.all([
    fetchDirectCompletedBookings(admin, cid),
    fetchRosterBookingIds(admin, cid),
  ]);
  const rosterRows = await fetchRosterCompletedBookings(admin, rosterBookingIds);

  const deduped = new Map<string, CleanerAllTimeEarningsBookingRow>();
  for (const row of [...directRows, ...rosterRows]) {
    const bookingId = String(row.id ?? "").trim();
    if (bookingId) deduped.set(bookingId, row);
  }

  const bookingIds = [...deduped.keys()];
  const viewerPayouts = await fetchViewerPayoutsChunked(admin, cid, bookingIds);
  return sumCleanerAllTimeEarningsFromRows([...deduped.values()], cid, viewerPayouts);
}
