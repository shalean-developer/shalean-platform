import type { SupabaseClient } from "@supabase/supabase-js";
import { adjustBookingPayoutEarnings } from "@/lib/payout/adjustBookingPayoutEarnings";
import { adjustBookingTeamMemberPayoutEarnings } from "@/lib/payout/adjustBookingTeamMemberPayoutEarnings";
import { classifyVisitPayoutEdit } from "@/lib/payout/classifyVisitPayoutEdit";

/**
 * Facade: classify the visit/cleaner shape, then dispatch to solo or per-cleaner adjusters.
 */
export async function adjustVisitPayoutEarnings(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    cleanerId?: string | null;
    payoutCents: number;
    bonusCents?: number;
    adjustmentNote?: string | null;
    adminUserId: string;
  },
): Promise<
  | { ok: true; payoutId: string | null; batchTotalCents: number | null; mode: "solo_owner" | "per_cleaner" }
  | { ok: false; error: string; code?: string }
> {
  const bookingId = String(params.bookingId ?? "").trim();
  const requestedCleanerId = String(params.cleanerId ?? "").trim();
  if (!bookingId) return { ok: false, error: "Missing booking id.", code: "invalid_params" };

  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select("id, is_team_job, cleaner_id, payout_owner_cleaner_id, team_id, earnings_summary")
    .eq("id", bookingId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message, code: "booking_load_failed" };
  if (!booking) return { ok: false, error: "Booking not found.", code: "booking_not_found" };

  const row = booking as {
    is_team_job?: boolean | null;
    cleaner_id?: string | null;
    payout_owner_cleaner_id?: string | null;
    team_id?: string | null;
    earnings_summary?: unknown;
  };

  const { data: rosterRows, error: rosterErr } = await admin
    .from("booking_cleaners")
    .select("cleaner_id")
    .eq("booking_id", bookingId);
  if (rosterErr) return { ok: false, error: rosterErr.message, code: "roster_load_failed" };
  const rosterCleanerIds = (rosterRows ?? [])
    .map((r) => String((r as { cleaner_id?: string }).cleaner_id ?? "").trim())
    .filter(Boolean);

  let hasTeamMemberPayoutRow = false;
  let hasRosterMemberPayoutRow = false;
  if (requestedCleanerId) {
    const { data: tj, error: tjErr } = await admin
      .from("team_job_member_payouts")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("cleaner_id", requestedCleanerId)
      .maybeSingle();
    if (tjErr) return { ok: false, error: tjErr.message, code: "team_member_payout_lookup_failed" };
    hasTeamMemberPayoutRow = Boolean(tj);

    const { data: rp, error: rpErr } = await admin
      .from("booking_roster_member_payouts")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("cleaner_id", requestedCleanerId)
      .maybeSingle();
    if (rpErr) return { ok: false, error: rpErr.message, code: "roster_member_payout_lookup_failed" };
    hasRosterMemberPayoutRow = Boolean(rp);
  }

  const mode = classifyVisitPayoutEdit({
    is_team_job: row.is_team_job,
    cleaner_id: row.cleaner_id,
    payout_owner_cleaner_id: row.payout_owner_cleaner_id,
    team_id: row.team_id,
    earnings_summary: row.earnings_summary,
    rosterCleanerIds,
    hasTeamMemberPayoutRow,
    hasRosterMemberPayoutRow,
    requestedCleanerId,
  });

  if (mode === "per_cleaner") {
    if (!requestedCleanerId) {
      return {
        ok: false,
        error: "cleaner_id is required for multi-cleaner visit earnings edits.",
        code: "cleaner_id_required",
      };
    }
    const result = await adjustBookingTeamMemberPayoutEarnings(admin, {
      bookingId,
      cleanerId: requestedCleanerId,
      payoutCents: params.payoutCents,
      bonusCents: params.bonusCents,
      adjustmentNote: params.adjustmentNote,
      adminUserId: params.adminUserId,
    });
    if (!result.ok) return result;
    return { ...result, mode };
  }

  const result = await adjustBookingPayoutEarnings(admin, {
    bookingId,
    cleanerId: requestedCleanerId || undefined,
    payoutCents: params.payoutCents,
    bonusCents: params.bonusCents,
    adjustmentNote: params.adjustmentNote,
    adminUserId: params.adminUserId,
  });
  if (!result.ok) return result;
  return { ...result, mode };
}
