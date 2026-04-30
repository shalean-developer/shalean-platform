import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePersistCleanerIdForBooking, type BookingPersistIdsRow } from "@/lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";

export type BackfillCompletedMissingDisplayEarningsResult =
  | { ok: true; fixed: number; skipped: number; failed: number }
  | { ok: false; error: string };

/**
 * Best-effort repair for `status = completed` rows with `display_earnings_cents` still null.
 * Used by admin POST and payout-integrity cron auto-recovery.
 */
export async function backfillCompletedMissingDisplayEarnings(
  admin: SupabaseClient,
  limit = 100,
): Promise<BackfillCompletedMissingDisplayEarningsResult> {
  const { data, error } = await admin
    .from("bookings")
    .select("id, cleaner_id, payout_owner_cleaner_id, is_team_job")
    .eq("status", "completed")
    .eq("is_test", false)
    .is("display_earnings_cents", null)
    .limit(limit);

  if (error) return { ok: false, error: error.message };

  let fixed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of data ?? []) {
    const rid = typeof (row as { id?: unknown }).id === "string" ? String((row as { id: string }).id) : "";
    if (!rid) {
      skipped += 1;
      continue;
    }
    const persistCleanerId = resolvePersistCleanerIdForBooking(row as BookingPersistIdsRow);
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

  return { ok: true, fixed, skipped, failed };
}
