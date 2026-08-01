import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BOOKING_SELECT_FIELDS_FOR_WEEKLY_BATCH_ELIGIBILITY,
  bookingPayableForWeeklyBatch,
  type BookingRowForWeeklyBatchEligibility,
} from "@/lib/payout/bookingPayableForWeeklyBatch";
import { isYmdInInclusiveRange, weeklyBatchDayYmd } from "@/lib/payout/weekBounds";

export type TeamJobMemberWeeklyPayoutCandidate = {
  id: string;
  booking_id: string;
  payout_cents: number;
  booking: BookingRowForWeeklyBatchEligibility & { id: string };
};

/**
 * Completed team jobs pay non-lead cleaners via `team_job_member_payouts` (not `bookings.cleaner_id`).
 * Weekly batch generation must include these rows alongside solo bookings and paired-roster splits.
 */
export async function listTeamJobMemberWeeklyPayoutCandidates(params: {
  admin: SupabaseClient;
  cleanerId: string;
  periodStart: string;
  periodEnd: string;
  invoiceStatusById: Map<string, string>;
}): Promise<TeamJobMemberWeeklyPayoutCandidate[]> {
  const { admin, cleanerId, periodStart, periodEnd, invoiceStatusById } = params;

  const { data: memberRows, error: memberErr } = await admin
    .from("team_job_member_payouts")
    .select("id, booking_id, payout_cents")
    .eq("cleaner_id", cleanerId)
    .is("cleaner_payout_id", null)
    .eq("status", "pending");
  if (memberErr || !memberRows?.length) return [];

  const bookingIds = [
    ...new Set(
      memberRows
        .map((row) => String((row as { booking_id?: string }).booking_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (!bookingIds.length) return [];

  const { data: bookingRows, error: bErr } = await admin
    .from("bookings")
    .select(BOOKING_SELECT_FIELDS_FOR_WEEKLY_BATCH_ELIGIBILITY)
    .in("id", bookingIds)
    .eq("status", "completed")
    .eq("is_test", false);
  if (bErr || !bookingRows?.length) return [];

  const bookingById = new Map<string, BookingRowForWeeklyBatchEligibility & { id: string }>();
  for (const raw of bookingRows) {
    const row = raw as BookingRowForWeeklyBatchEligibility & { id: string };
    if (row.id) bookingById.set(row.id, row);
  }

  const out: TeamJobMemberWeeklyPayoutCandidate[] = [];
  for (const raw of memberRows) {
    const member = raw as {
      id?: string;
      booking_id?: string;
      payout_cents?: number | null;
    };
    const id = String(member.id ?? "").trim();
    const bookingId = String(member.booking_id ?? "").trim();
    if (!id || !bookingId) continue;

    const booking = bookingById.get(bookingId);
    if (!booking) continue;

    const ymd = weeklyBatchDayYmd(booking);
    if (!ymd || !isYmdInInclusiveRange(ymd, periodStart, periodEnd)) continue;

    const gate = bookingPayableForWeeklyBatch(booking, invoiceStatusById);
    if (!gate.payable) continue;

    const payoutCents = Math.max(0, Math.floor(Number(member.payout_cents) || 0));
    if (payoutCents <= 0) continue;

    out.push({
      id,
      booking_id: bookingId,
      payout_cents: payoutCents,
      booking,
    });
  }

  return out;
}

export function teamJobMemberWeeklyPayoutTotalCents(rows: readonly TeamJobMemberWeeklyPayoutCandidate[]): number {
  return rows.reduce((sum, row) => sum + row.payout_cents, 0);
}
