import "server-only";

import type { ReplaceBookingCleanersRpcRow } from "@/lib/admin/bookingRosterReplacePayload";
import { normalizeUuidCandidate } from "@/lib/booking/userSelectedCleanerFromSnapshot";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RecurringPlanRosterContinuity = {
  leadCleanerId: string;
  cleanerCount: number;
  rosterRows: ReplaceBookingCleanersRpcRow[];
};

type RosterJoinRow = {
  cleaner_id?: string | null;
  role?: string | null;
  payout_weight?: number | string | null;
  lead_bonus_cents?: number | string | null;
  source?: string | null;
};

/**
 * Most recent non-cancelled occurrence on this plan that had a multi-cleaner roster.
 * Used to propagate dual-cleaner (and larger) rosters onto newly generated visits.
 */
export async function fetchLastAssignedRosterForRecurringPlan(
  admin: SupabaseClient,
  recurringId: string,
): Promise<RecurringPlanRosterContinuity | null> {
  const id = recurringId.trim();
  if (!id) return null;

  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, cleaner_id, cleaner_count, booking_cleaners(cleaner_id, role, payout_weight, lead_bonus_cents, source)",
    )
    .eq("recurring_id", id)
    .neq("status", "cancelled")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(30);

  if (error || !data?.length) return null;

  for (const raw of data) {
    const row = raw as {
      cleaner_id?: string | null;
      cleaner_count?: number | null;
      booking_cleaners?: RosterJoinRow[] | null;
    };
    const joinRows = Array.isArray(row.booking_cleaners) ? row.booking_cleaners : [];
    if (joinRows.length < 2) continue;

    const rosterRows: ReplaceBookingCleanersRpcRow[] = [];
    let leadCleanerId: string | null = null;

    for (const bc of joinRows) {
      const cleanerId = normalizeUuidCandidate(bc.cleaner_id ?? null);
      if (!cleanerId) continue;
      const roleRaw = String(bc.role ?? "").trim().toLowerCase();
      const role = roleRaw === "lead" ? "lead" : "member";
      if (role === "lead") leadCleanerId = cleanerId;
      const payoutWeight = Number(bc.payout_weight ?? 1);
      const leadBonusCents = Math.floor(Number(bc.lead_bonus_cents ?? 0));
      rosterRows.push({
        cleaner_id: cleanerId,
        role,
        payout_weight: Number.isFinite(payoutWeight) && payoutWeight > 0 ? payoutWeight : 1,
        lead_bonus_cents: Number.isFinite(leadBonusCents) && leadBonusCents >= 0 ? leadBonusCents : 0,
        source: String(bc.source ?? "").trim() || "recurring_continuity",
      });
    }

    if (rosterRows.length < 2 || !leadCleanerId) continue;

    const leadCount = rosterRows.filter((r) => r.role === "lead").length;
    if (leadCount !== 1) continue;

    const cleanerCount = Math.max(
      rosterRows.length,
      Number.isFinite(Number(row.cleaner_count)) ? Number(row.cleaner_count) : rosterRows.length,
    );

    return { leadCleanerId, cleanerCount, rosterRows };
  }

  return null;
}
