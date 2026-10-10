import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { payoutQueryChunks } from "@/lib/payout/payoutQueryPagination";

/**
 * Phase 4 reverse dual-rail: bookings already claimed/paid on the ledger rail
 * must not enter a weekly cleaner_payouts batch.
 */
export async function filterBookingsNotOnLedgerRail(
  admin: SupabaseClient,
  bookingIds: string[],
): Promise<{ allowedIds: Set<string>; blockedIds: string[] }> {
  const ids = [...new Set(bookingIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return { allowedIds: new Set(), blockedIds: [] };

  const data: unknown[] = [];
  for (const idChunk of payoutQueryChunks(ids)) {
    const { data: chunkRows, error } = await admin
      .from("cleaner_earnings")
      .select("booking_id, disbursement_id, status")
      .in("booking_id", idChunk);

    if (error) {
      // Fail open: weekly payroll must not halt on lookup errors; I3 still blocks ledger→weekly reverse.
      console.warn("[filterBookingsNotOnLedgerRail] lookup failed:", error.message);
      return { allowedIds: new Set(ids), blockedIds: [] };
    }
    data.push(...(chunkRows ?? []));
  }

  const blocked = new Set<string>();
  for (const row of data) {
    const r = row as {
      booking_id?: string | null;
      disbursement_id?: string | null;
      status?: string | null;
    };
    const bid = String(r.booking_id ?? "").trim();
    if (!bid) continue;
    const disbursed = String(r.disbursement_id ?? "").trim();
    const status = String(r.status ?? "").trim().toLowerCase();
    if (disbursed || status === "paid" || status === "claimed" || status === "disbursed") {
      blocked.add(bid);
    }
  }

  const allowedIds = new Set(ids.filter((id) => !blocked.has(id)));
  return { allowedIds, blockedIds: [...blocked] };
}
