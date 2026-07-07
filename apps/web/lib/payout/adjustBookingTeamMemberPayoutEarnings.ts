import type { SupabaseClient } from "@supabase/supabase-js";
import { logAdminEarningsAction } from "@/lib/admin/logAdminEarningsAction";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { bookingPayoutConstraintCapCents, type BookingRowForPayoutCap } from "@/lib/payout/bookingPayoutCapCents";
import {
  parseBookingEarningsSummary,
  patchEarningsSummaryForCleaner,
} from "@/lib/payout/bookingEarningsSummary";
import { syncPayoutBatchFromBookings } from "@/lib/payout/syncPayoutBatchFromBookings";
import { assertBookingVisitPayoutEditable } from "@/lib/payout/visitPayoutEditGuards";

type BookingRow = BookingRowForPayoutCap & {
  id: string;
  team_id: string | null;
  payout_id: string | null;
  payout_status: string | null;
  payout_paid_at?: string | null;
  is_team_job: boolean | null;
  earnings_summary?: unknown;
};

export async function adjustBookingTeamMemberPayoutEarnings(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    cleanerId: string;
    payoutCents: number;
    bonusCents?: number;
    adjustmentNote?: string | null;
    adminUserId: string;
  },
): Promise<
  | { ok: true; payoutId: string | null; batchTotalCents: number | null }
  | { ok: false; error: string; code?: string }
> {
  const payoutCents = Math.max(0, Math.round(params.payoutCents));
  const bonusCents = Math.max(0, Math.round(params.bonusCents ?? 0));
  const cleanerId = String(params.cleanerId ?? "").trim();
  if (!cleanerId) return { ok: false, error: "cleaner_id is required for team jobs.", code: "invalid_params" };

  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select(
      "id, status, team_id, payout_id, payout_status, payout_paid_at, is_team_job, billing_type, is_monthly_billing_booking, payment_status, monthly_invoice_id, total_paid_cents, amount_paid_cents, total_paid_zar, earnings_summary",
    )
    .eq("id", params.bookingId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message, code: "booking_load_failed" };
  if (!booking) return { ok: false, error: "Booking not found.", code: "booking_not_found" };

  const row = booking as BookingRow;
  if (row.is_team_job !== true) {
    return { ok: false, error: "Booking is not a team job.", code: "not_team_job" };
  }

  const summary = parseBookingEarningsSummary(row.earnings_summary);
  if (!summary?.per_cleaner_earnings.some((entry) => entry.cleaner_id === cleanerId)) {
    return { ok: false, error: "Cleaner is not on this team visit payout.", code: "cleaner_not_on_visit" };
  }

  const editable = await assertBookingVisitPayoutEditable(admin, row);
  if (!editable.ok) return editable;

  const payoutId = editable.payoutId;
  const othersTotal = summary.per_cleaner_earnings
    .filter((entry) => entry.cleaner_id !== cleanerId)
    .reduce((sum, entry) => sum + Math.max(0, Math.round(entry.total_cents ?? 0)), 0);
  const teamTotal = othersTotal + payoutCents + bonusCents;
  const cap = bookingPayoutConstraintCapCents(row);
  if (teamTotal > cap) {
    return {
      ok: false,
      error: `Team payout R${Math.round(teamTotal / 100)} exceeds visit financial cap R${Math.round(cap / 100)}.`,
      code: "payout_exceeds_financial_cap",
    };
  }

  const updatedSummary = patchEarningsSummaryForCleaner(summary, cleanerId, payoutCents, bonusCents);
  if (!updatedSummary) {
    return { ok: false, error: "Cleaner is not on this team visit payout.", code: "cleaner_not_on_visit" };
  }
  const teamId = String(row.team_id ?? "").trim();

  const { data: memberRow, error: memberErr } = await admin
    .from("team_job_member_payouts")
    .select("status")
    .eq("booking_id", params.bookingId)
    .eq("cleaner_id", cleanerId)
    .maybeSingle();
  if (memberErr) return { ok: false, error: memberErr.message, code: "team_member_payout_lookup_failed" };
  if (memberRow) {
    const memberStatus = String((memberRow as { status?: string | null }).status ?? "")
      .trim()
      .toLowerCase();
    if (memberStatus && memberStatus !== "pending") {
      return {
        ok: false,
        error: "Team member payout is already batched or paid.",
        code: "team_member_payout_locked",
      };
    }
  }

  const patch: Record<string, unknown> = {
    earnings_summary: updatedSummary,
    cleaner_earnings_total_cents: updatedSummary.total_cleaner_earnings_cents,
    company_revenue_cents: updatedSummary.company_revenue_cents,
  };
  const payoutStatus = String(row.payout_status ?? "").trim().toLowerCase();
  if (payoutStatus === "eligible" || payoutStatus === "paid") {
    patch.payout_frozen_cents = updatedSummary.total_cleaner_earnings_cents;
  }

  const { data: updated, error: upErr } = await admin
    .from("bookings")
    .update(patch)
    .eq("id", params.bookingId)
    .select("id");
  if (upErr) return { ok: false, error: upErr.message, code: "booking_update_failed" };
  if (!updated?.length) return { ok: false, error: "Booking could not be updated.", code: "booking_update_failed" };

  if (teamId) {
    const { error: teamUpErr } = await admin
      .from("team_job_member_payouts")
      .update({ payout_cents: payoutCents })
      .eq("booking_id", params.bookingId)
      .eq("cleaner_id", cleanerId)
      .eq("status", "pending");
    if (teamUpErr) return { ok: false, error: teamUpErr.message, code: "team_member_payout_update_failed" };
  }

  let batchTotalCents: number | null = null;
  if (payoutId) {
    const synced = await syncPayoutBatchFromBookings(admin, payoutId);
    if (!synced.ok) return { ok: false, error: synced.error, code: "batch_sync_failed" };
    batchTotalCents = synced.totalCents;
  }

  await logAdminEarningsAction(admin, {
    bookingId: params.bookingId,
    action: "manual_adjust",
    adminUserId: params.adminUserId,
  });

  void logSystemEvent({
    level: "info",
    source: "BOOKING_TEAM_MEMBER_PAYOUT_EARNINGS_ADJUSTED",
    message: "Admin manually adjusted team visit member payout earnings",
    context: {
      bookingId: params.bookingId,
      cleanerId,
      payoutId,
      adminUserId: params.adminUserId,
      payout_cents: payoutCents,
      bonus_cents: bonusCents,
      adjustment_note: params.adjustmentNote?.trim() || null,
      batch_total_cents: batchTotalCents,
    },
  });

  return { ok: true, payoutId, batchTotalCents };
}
