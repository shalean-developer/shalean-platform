import "server-only";

import type { ReplaceBookingCleanersRpcRow } from "@/lib/admin/bookingRosterReplacePayload";
import { fetchLastAssignedRosterForRecurringPlan } from "@/lib/recurring/fetchLastAssignedRosterForRecurringPlan";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Copies the prior visit's multi-cleaner roster onto a generated recurring occurrence.
 * No-op when the plan has no prior multi-cleaner visit or the booking is locked/finalized.
 */
export async function applyRecurringOccurrenceRosterContinuity(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    recurringId: string;
    /** Lead cleaner already resolved for this occurrence (fallback when roster fetch fails). */
    leadCleanerId?: string | null;
    /** Pre-fetched roster (optional — avoids duplicate query when batching). */
    roster?: {
      leadCleanerId: string;
      cleanerCount: number;
      rosterRows: ReplaceBookingCleanersRpcRow[];
    } | null;
  },
): Promise<{ applied: boolean; cleanerCount: number }> {
  const bookingId = params.bookingId.trim();
  const recurringId = params.recurringId.trim();
  if (!bookingId || !recurringId) return { applied: false, cleanerCount: 0 };

  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select(
      "id, status, team_id, is_team_job, cleaner_line_earnings_finalized_at, cleaner_count, booking_cleaners(cleaner_id)",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (loadErr || !booking) return { applied: false, cleanerCount: 0 };

  const row = booking as {
    team_id?: string | null;
    is_team_job?: boolean | null;
    cleaner_line_earnings_finalized_at?: string | null;
    cleaner_count?: number | null;
    booking_cleaners?: { cleaner_id?: string | null }[] | null;
  };

  if (row.is_team_job === true || row.team_id) return { applied: false, cleanerCount: 0 };
  if (row.cleaner_line_earnings_finalized_at) return { applied: false, cleanerCount: 0 };

  const existingRoster = Array.isArray(row.booking_cleaners) ? row.booking_cleaners : [];
  if (existingRoster.length >= 2) {
    return { applied: false, cleanerCount: existingRoster.length };
  }

  const continuity =
    params.roster ?? (await fetchLastAssignedRosterForRecurringPlan(admin, recurringId));
  if (!continuity || continuity.rosterRows.length < 2) {
    return { applied: false, cleanerCount: Number(row.cleaner_count ?? 1) || 1 };
  }

  const leadId = continuity.leadCleanerId || params.leadCleanerId?.trim() || null;
  if (!leadId) return { applied: false, cleanerCount: 0 };

  const { error: rpcErr } = await admin.rpc("replace_booking_cleaners_admin_atomic", {
    p_booking_id: bookingId,
    p_rows: continuity.rosterRows,
  });
  if (rpcErr) return { applied: false, cleanerCount: 0 };

  const now = new Date().toISOString();
  const { error: patchErr } = await admin
    .from("bookings")
    .update({
      cleaner_id: leadId,
      selected_cleaner_id: leadId,
      payout_owner_cleaner_id: leadId,
      cleaner_mode: "individual_cleaners",
      cleaner_count: continuity.cleanerCount,
      is_team_job: false,
      team_id: null,
      assigned_at: now,
      cleaner_response_status: "pending",
      dispatch_status: "assigned",
      status: "assigned",
    })
    .eq("id", bookingId);

  if (patchErr) return { applied: false, cleanerCount: 0 };

  return { applied: true, cleanerCount: continuity.cleanerCount };
}
