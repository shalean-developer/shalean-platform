import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRepairCompletionCoherencePatch } from "@/lib/booking/bookingCompletionIntegrity";
import { ensureCleanerEarningsLedgerRow } from "@/lib/payout/ensureCleanerEarningsLedger";

type CompletionRow = {
  status?: string | null;
  completed_at?: string | null;
  dispatch_status?: string | null;
};

function statusIsCompleted(status: string | null | undefined): boolean {
  return String(status ?? "")
    .trim()
    .toLowerCase() === "completed";
}

/**
 * Heals `completed_at` + non-terminal `status` drift (e.g. cron completed, then recurring
 * propagate rewrote status to assigned). Optionally inserts the solo `cleaner_earnings` ledger row.
 *
 * Important: do **not** early-return on {@link isAuthoritativeBookingCompleted} — that helper
 * treats a lone `completed_at` as completed, which would skip the exact status heal this
 * function exists to perform.
 */
export async function repairBookingCompletionCoherenceIfNeeded(params: {
  admin: SupabaseClient;
  bookingId: string;
  row: CompletionRow;
  ensureLedger?: boolean;
}): Promise<{ repaired: boolean }> {
  const { admin, bookingId } = params;
  const row = params.row;

  if (statusIsCompleted(row.status)) {
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
