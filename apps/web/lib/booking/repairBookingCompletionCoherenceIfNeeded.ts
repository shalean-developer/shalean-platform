import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRepairCompletionCoherencePatch } from "@/lib/booking/bookingCompletionIntegrity";
import { isAuthoritativeBookingCompleted } from "@/lib/booking/deriveBookingOperationalPhase";
import { ensureCleanerEarningsLedgerRow } from "@/lib/payout/ensureCleanerEarningsLedger";

type CompletionRow = {
  status?: string | null;
  completed_at?: string | null;
  dispatch_status?: string | null;
};

/**
 * Heals `completed_at` + non-terminal `status` drift (e.g. cron completed, roster continuity
 * rewrote status to assigned). Optionally inserts the solo `cleaner_earnings` ledger row.
 */
export async function repairBookingCompletionCoherenceIfNeeded(params: {
  admin: SupabaseClient;
  bookingId: string;
  row: CompletionRow;
  ensureLedger?: boolean;
}): Promise<{ repaired: boolean }> {
  const { admin, bookingId } = params;
  const row = params.row;

  if (isAuthoritativeBookingCompleted(row)) {
    if (params.ensureLedger) {
      await ensureCleanerEarningsLedgerRow({ admin, bookingId });
    }
    return { repaired: false };
  }

  const repair = buildRepairCompletionCoherencePatch(row as Record<string, unknown>);
  if (!repair) return { repaired: false };

  const { error } = await admin.from("bookings").update(repair).eq("id", bookingId);
  if (error) return { repaired: false };

  if (params.ensureLedger) {
    await ensureCleanerEarningsLedgerRow({ admin, bookingId });
  }
  return { repaired: true };
}
