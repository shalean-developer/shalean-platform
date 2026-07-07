import type { SupabaseClient } from "@supabase/supabase-js";
import { logAdminEarningsAction } from "@/lib/admin/logAdminEarningsAction";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { assertHybridPayoutWithinFinancialCap, bookingPayoutConstraintCapCents, type BookingRowForPayoutCap } from "@/lib/payout/bookingPayoutCapCents";
import { parseBookingEarningsSummary, patchEarningsSummaryForCleaner } from "@/lib/payout/bookingEarningsSummary";
import { syncPayoutBatchFromBookings } from "@/lib/payout/syncPayoutBatchFromBookings";
import { assertBookingVisitPayoutEditable } from "@/lib/payout/visitPayoutEditGuards";

type BookingRow = BookingRowForPayoutCap & {
  id: string;
  payout_id: string | null;
  payout_status: string | null;
  payout_paid_at?: string | null;
  is_team_job: boolean | null;
  status: string | null;
  cleaner_payout_cents: number | null;
  cleaner_bonus_cents: number | null;
  cleaner_id: string | null;
  earnings_summary?: unknown;
};

export async function adjustBookingPayoutEarnings(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    payoutCents: number;
    bonusCents?: number;
    cleanerId?: string | null;
    adjustmentNote?: string | null;
    adminUserId: string;
  },
): Promise<
  | { ok: true; payoutId: string | null; batchTotalCents: number | null }
  | { ok: false; error: string; code?: string }
> {
  const payoutCents = Math.max(0, Math.round(params.payoutCents));
  const bonusCents = Math.max(0, Math.round(params.bonusCents ?? 0));
  const displayCents = payoutCents + bonusCents;

  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select(
      "id, status, cleaner_id, payout_id, payout_status, payout_paid_at, is_team_job, billing_type, is_monthly_billing_booking, payment_status, monthly_invoice_id, total_paid_cents, amount_paid_cents, total_paid_zar, cleaner_payout_cents, cleaner_bonus_cents, earnings_summary",
    )
    .eq("id", params.bookingId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message, code: "booking_load_failed" };
  if (!booking) return { ok: false, error: "Booking not found.", code: "booking_not_found" };

  const row = booking as BookingRow;
  if (row.is_team_job === true) {
    return {
      ok: false,
      error: "Team job earnings require cleaner_id (use team member adjustment).",
      code: "team_job_requires_cleaner_id",
    };
  }

  const editable = await assertBookingVisitPayoutEditable(admin, row);
  if (!editable.ok) return editable;

  const payoutId = editable.payoutId;

  const capCheck = assertHybridPayoutWithinFinancialCap({ row, payoutCents, bonusCents });
  if (!capCheck.ok) {
    return {
      ok: false,
      error: `Payout R${Math.round(capCheck.hybrid / 100)} exceeds visit financial cap R${Math.round(capCheck.cap / 100)}.`,
      code: capCheck.code,
    };
  }

  const financialCap = bookingPayoutConstraintCapCents(row);
  const companyRevenueCents = Math.max(0, financialCap - displayCents);

  const patch: Record<string, unknown> = {
    cleaner_payout_cents: payoutCents,
    cleaner_bonus_cents: bonusCents,
    display_earnings_cents: displayCents,
    cleaner_earnings_total_cents: displayCents,
    company_revenue_cents: companyRevenueCents,
  };

  const summary = parseBookingEarningsSummary(row.earnings_summary);
  const summaryCleanerId =
    String(params.cleanerId ?? "").trim() ||
    String(row.cleaner_id ?? "").trim() ||
    summary?.per_cleaner_earnings[0]?.cleaner_id ||
    "";
  if (summary && summaryCleanerId) {
    const updatedSummary = patchEarningsSummaryForCleaner(summary, summaryCleanerId, payoutCents, bonusCents);
    if (updatedSummary) {
      patch.earnings_summary = updatedSummary;
      patch.cleaner_earnings_total_cents = updatedSummary.total_cleaner_earnings_cents;
      patch.company_revenue_cents = updatedSummary.company_revenue_cents;
    }
  }

  const ps = String(row.payout_status ?? "").trim().toLowerCase();
  if (ps === "eligible" || ps === "paid") {
    patch.payout_frozen_cents = displayCents;
  }

  const { data: updated, error: upErr } = await admin
    .from("bookings")
    .update(patch)
    .eq("id", params.bookingId)
    .select("id");
  if (upErr) return { ok: false, error: upErr.message, code: "booking_update_failed" };
  if (!updated?.length) return { ok: false, error: "Booking could not be updated.", code: "booking_update_failed" };

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
    source: "BOOKING_PAYOUT_EARNINGS_ADJUSTED",
    message: "Admin manually adjusted per-visit cleaner payout earnings",
    context: {
      bookingId: params.bookingId,
      payoutId,
      adminUserId: params.adminUserId,
      previous_payout_cents: row.cleaner_payout_cents,
      previous_bonus_cents: row.cleaner_bonus_cents,
      payout_cents: payoutCents,
      bonus_cents: bonusCents,
      adjustment_note: params.adjustmentNote?.trim() || null,
      batch_total_cents: batchTotalCents,
    },
  });

  return { ok: true, payoutId, batchTotalCents };
}
