import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 3 I3 soft gate (app-layer belt-and-suspenders).
 * DB claim RPC already excludes weekly-rail bookings (20261065).
 * This rejects early with a clear error when any approved ledger row's booking
 * is already linked to a weekly payout or marked paid on the weekly rail.
 */
export async function assertLedgerClaimNotOnWeeklyRail(
  admin: SupabaseClient,
  cleanerId: string,
): Promise<{ ok: true } | { ok: false; error: string; code: string }> {
  const cid = cleanerId.trim();
  if (!cid) return { ok: false, error: "Invalid cleaner id", code: "invalid_cleaner" };

  const { data: ceRows, error: ceErr } = await admin
    .from("cleaner_earnings")
    .select("id, booking_id")
    .eq("cleaner_id", cid)
    .eq("status", "approved")
    .is("disbursement_id", null)
    .limit(200);

  if (ceErr) return { ok: false, error: ceErr.message, code: "earnings_load_failed" };

  const bookingIds = [
    ...new Set(
      (ceRows ?? [])
        .map((r) => String((r as { booking_id?: string | null }).booking_id ?? "").trim())
        .filter((id) => /^[0-9a-f-]{36}$/i.test(id)),
    ),
  ];
  if (!bookingIds.length) return { ok: true };

  const { data: bookings, error: bErr } = await admin
    .from("bookings")
    .select("id, payout_id, payout_status")
    .in("id", bookingIds);

  if (bErr) return { ok: false, error: bErr.message, code: "bookings_load_failed" };

  for (const b of bookings ?? []) {
    const row = b as { id?: string; payout_id?: string | null; payout_status?: string | null };
    const payoutId = String(row.payout_id ?? "").trim();
    const ps = String(row.payout_status ?? "").trim().toLowerCase();
    if (payoutId || ps === "paid") {
      return {
        ok: false,
        error:
          "Dual-rail block (I3): one or more approved earnings bookings are already on the weekly payout rail.",
        code: "dual_rail_weekly_conflict",
      };
    }
  }

  return { ok: true };
}
