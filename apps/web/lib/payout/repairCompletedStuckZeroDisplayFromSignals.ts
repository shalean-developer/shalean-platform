import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bookingSignalsPaidForZeroDisplayRecompute,
  bookingsPersistSelectListForPersist,
  resolvePersistCleanerIdForBooking,
  type BookingPaidSignalRow,
  type BookingPersistIdsRow,
} from "@/lib/payout/bookingEarningsIntegrity";
import { persistBookingEarningsSnapshotCommand } from "@/lib/payout/persistBookingEarningsSnapshotCommand";
import { bookingHasActivePayoutAttributionRemoval } from "@/lib/payout/bookingPayoutAttributionRemoval";

type StuckZeroScanRow = BookingPaidSignalRow & BookingPersistIdsRow;

export type RepairStuckZeroDisplayFromSignalsResult =
  | { ok: true; scanned: number; matched_signals: number; fixed: number; skipped: number; failed: number }
  | { ok: false; error: string };

/**
 * Daily self-heal: completed jobs with `display_earnings_cents = 0` but paid-like signals
 * (see {@link bookingSignalsPaidForZeroDisplayRecompute}) get `persistCleanerPayoutIfUnset` again.
 */
export async function repairCompletedStuckZeroDisplayFromSignals(
  admin: SupabaseClient,
  limit = 150,
): Promise<RepairStuckZeroDisplayFromSignalsResult> {
  const pageSize = Math.min(150, Math.max(25, limit));
  let cursor: string | null = null;
  let scanned = 0;
  let actionableScanned = 0;
  let matched_signals = 0;
  let fixed = 0;
  let skipped = 0;
  let failed = 0;

  while (actionableScanned < limit) {
    let query = admin
      .from("bookings")
      .select(bookingsPersistSelectListForPersist())
      .eq("status", "completed")
      .eq("display_earnings_cents", 0)
      .eq("is_test", false)
      .order("id", { ascending: true });
    if (cursor) query = query.gt("id", cursor);

    const { data, error } = await query.limit(pageSize);
    if (error) return { ok: false, error: error.message };

    const rows = (data ?? []) as StuckZeroScanRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      const rid = typeof row.id === "string" ? row.id : "";
      if (rid) cursor = rid;
      scanned += 1;

      if (bookingHasActivePayoutAttributionRemoval(row)) {
        skipped += 1;
        continue;
      }

      actionableScanned += 1;
      if (!bookingSignalsPaidForZeroDisplayRecompute(row)) {
        skipped += 1;
        if (actionableScanned >= limit) break;
        continue;
      }
      matched_signals += 1;
      if (!rid) {
        skipped += 1;
        if (actionableScanned >= limit) break;
        continue;
      }
      const persistCleanerId = resolvePersistCleanerIdForBooking(row);
      if (!persistCleanerId) {
        skipped += 1;
        if (actionableScanned >= limit) break;
        continue;
      }
      try {
        const result = await persistBookingEarningsSnapshotCommand({ admin, bookingId: rid, cleanerId: persistCleanerId });
        if (!result.ok) failed += 1;
        else if (result.skipped) skipped += 1;
        else fixed += 1;
      } catch {
        failed += 1;
      }
      if (actionableScanned >= limit) break;
    }

    if (rows.length < pageSize) break;
  }

  return { ok: true, scanned, matched_signals, fixed, skipped, failed };
}
