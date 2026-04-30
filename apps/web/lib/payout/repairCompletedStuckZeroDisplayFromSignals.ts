import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bookingSignalsPaidForZeroDisplayRecompute,
  bookingsPersistSelectListForPersist,
  resolvePersistCleanerIdForBooking,
  type BookingPaidSignalRow,
  type BookingPersistIdsRow,
} from "@/lib/payout/bookingEarningsIntegrity";

type StuckZeroScanRow = BookingPaidSignalRow & BookingPersistIdsRow;
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";

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
  const { data, error } = await admin
    .from("bookings")
    .select(bookingsPersistSelectListForPersist())
    .eq("status", "completed")
    .eq("display_earnings_cents", 0)
    .eq("is_test", false)
    .limit(limit);

  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as StuckZeroScanRow[];
  let matched_signals = 0;
  let fixed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (!bookingSignalsPaidForZeroDisplayRecompute(row)) {
      skipped += 1;
      continue;
    }
    matched_signals += 1;
    const rid = typeof row.id === "string" ? row.id : "";
    if (!rid) {
      skipped += 1;
      continue;
    }
    const persistCleanerId = resolvePersistCleanerIdForBooking(row);
    if (!persistCleanerId) {
      skipped += 1;
      continue;
    }
    try {
      const result = await persistCleanerPayoutIfUnset({ admin, bookingId: rid, cleanerId: persistCleanerId });
      if (!result.ok) failed += 1;
      else if (result.skipped) skipped += 1;
      else fixed += 1;
    } catch {
      failed += 1;
    }
  }

  return { ok: true, scanned: rows.length, matched_signals, fixed, skipped, failed };
}
