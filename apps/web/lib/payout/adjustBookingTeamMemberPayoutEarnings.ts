import type { SupabaseClient } from "@supabase/supabase-js";
import { logAdminEarningsAction } from "@/lib/admin/logAdminEarningsAction";
import { resolveCleanerDashboardEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { assertVisitEarningsReadAfterWrite } from "@/lib/payout/assertVisitEarningsReadAfterWrite";
import { bookingPayoutConstraintCapCents, type BookingRowForPayoutCap } from "@/lib/payout/bookingPayoutCapCents";
import {
  parseBookingEarningsSummary,
  upsertEarningsSummaryForCleaner,
} from "@/lib/payout/bookingEarningsSummary";
import { isBookingHybridOwner } from "@/lib/payout/classifyVisitPayoutEdit";
import { requireVisitEarningsAdjustAudit } from "@/lib/payout/requireVisitEarningsAdjustAudit";
import { syncOpenPayoutBatchesForVisitEdit } from "@/lib/payout/syncPayoutBatchFromBookings";
import { assertBookingVisitPayoutEditable } from "@/lib/payout/visitPayoutEditGuards";

type BookingRow = BookingRowForPayoutCap & {
  id: string;
  date: string | null;
  team_id: string | null;
  payout_id: string | null;
  payout_status: string | null;
  payout_paid_at?: string | null;
  is_team_job: boolean | null;
  cleaner_id: string | null;
  payout_owner_cleaner_id: string | null;
  cleaner_payout_cents: number | null;
  cleaner_bonus_cents: number | null;
  display_earnings_cents: number | null;
  cleaner_earnings_total_cents: number | null;
  payout_frozen_cents: number | null;
  earnings_summary?: unknown;
};

/**
 * Per-cleaner visit earnings adjustment for formal team jobs, paired-roster solos,
 * and any booking where office allocates the cleaner via summary / TJ / roster rails.
 */
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
  const displayCents = payoutCents + bonusCents;
  const cleanerId = String(params.cleanerId ?? "").trim();
  if (!cleanerId) return { ok: false, error: "cleaner_id is required for per-cleaner visit edits.", code: "invalid_params" };

  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select(
      "id, date, status, team_id, cleaner_id, payout_owner_cleaner_id, payout_id, payout_status, payout_paid_at, is_team_job, billing_type, is_monthly_billing_booking, payment_status, monthly_invoice_id, total_paid_cents, amount_paid_cents, total_paid_zar, cleaner_payout_cents, cleaner_bonus_cents, display_earnings_cents, cleaner_earnings_total_cents, payout_frozen_cents, earnings_summary",
    )
    .eq("id", params.bookingId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message, code: "booking_load_failed" };
  if (!booking) return { ok: false, error: "Booking not found.", code: "booking_not_found" };

  const row = booking as BookingRow;

  const { data: rosterRows, error: rosterErr } = await admin
    .from("booking_cleaners")
    .select("cleaner_id, role")
    .eq("booking_id", params.bookingId);
  if (rosterErr) return { ok: false, error: rosterErr.message, code: "roster_load_failed" };
  const roster = (rosterRows ?? []) as Array<{ cleaner_id?: string | null; role?: string | null }>;
  const onRoster = roster.some((r) => String(r.cleaner_id ?? "").trim() === cleanerId);

  const { data: memberRow, error: memberErr } = await admin
    .from("team_job_member_payouts")
    .select("status, payout_cents")
    .eq("booking_id", params.bookingId)
    .eq("cleaner_id", cleanerId)
    .maybeSingle();
  if (memberErr) return { ok: false, error: memberErr.message, code: "team_member_payout_lookup_failed" };

  const { data: rosterPayRow, error: rosterPayErr } = await admin
    .from("booking_roster_member_payouts")
    .select("status, payout_cents, bonus_cents, cleaner_payout_id")
    .eq("booking_id", params.bookingId)
    .eq("cleaner_id", cleanerId)
    .maybeSingle();
  if (rosterPayErr) return { ok: false, error: rosterPayErr.message, code: "roster_member_payout_lookup_failed" };

  const summary = parseBookingEarningsSummary(row.earnings_summary);
  const inSummary = Boolean(summary?.per_cleaner_earnings.some((entry) => entry.cleaner_id === cleanerId));
  const hybridOwner = isBookingHybridOwner(row, cleanerId);
  const hasTj = Boolean(memberRow);
  const hasRosterPay = Boolean(rosterPayRow);

  if (!inSummary && !onRoster && !hasTj && !hasRosterPay && !hybridOwner) {
    return { ok: false, error: "Cleaner is not on this visit payout.", code: "cleaner_not_on_visit" };
  }

  const memberStatus = String((memberRow as { status?: string | null } | null)?.status ?? "")
    .trim()
    .toLowerCase();
  if (memberRow && memberStatus && memberStatus !== "pending" && memberStatus !== "batched") {
    return {
      ok: false,
      error: "Team member payout is already paid or locked.",
      code: "team_member_payout_locked",
    };
  }

  const rosterStatus = String((rosterPayRow as { status?: string | null } | null)?.status ?? "")
    .trim()
    .toLowerCase();
  if (rosterPayRow && rosterStatus && rosterStatus !== "pending" && rosterStatus !== "batched") {
    return {
      ok: false,
      error: "Roster member payout is already paid or locked.",
      code: "roster_member_payout_locked",
    };
  }

  const editable = await assertBookingVisitPayoutEditable(admin, row);
  if (!editable.ok) return editable;

  // TJ/roster rows can be batched without bookings.payout_id — require an open batch in period.
  if (memberStatus === "batched" || rosterStatus === "batched") {
    const bookingDate = String(row.date ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
      return { ok: false, error: "Visit date missing for batched member payout edit.", code: "booking_date_required" };
    }
    const { data: openBatches, error: openErr } = await admin
      .from("cleaner_payouts")
      .select("id, period_start, period_end")
      .eq("cleaner_id", cleanerId)
      .in("status", ["pending", "frozen"]);
    if (openErr) return { ok: false, error: openErr.message, code: "payout_lookup_failed" };
    const openInPeriod = (openBatches ?? []).some((raw) => {
      const from = String((raw as { period_start?: string | null }).period_start ?? "").trim();
      const to = String((raw as { period_end?: string | null }).period_end ?? "").trim();
      return from && to && bookingDate >= from && bookingDate <= to;
    });
    if (!openInPeriod) {
      return {
        ok: false,
        error: "Member payout batch is approved or paid; visit earnings cannot be edited.",
        code: "payout_batch_locked",
      };
    }
  }

  const previousTotalCents = resolveCleanerDashboardEarningsCents(row, cleanerId);

  const othersFromSummary = (summary?.per_cleaner_earnings ?? [])
    .filter((entry) => entry.cleaner_id !== cleanerId)
    .reduce((sum, entry) => sum + Math.max(0, Math.round(entry.total_cents ?? 0)), 0);

  const { data: tjPeers, error: tjPeersErr } = await admin
    .from("team_job_member_payouts")
    .select("cleaner_id, payout_cents")
    .eq("booking_id", params.bookingId);
  if (tjPeersErr) return { ok: false, error: tjPeersErr.message, code: "team_member_payout_lookup_failed" };
  const othersFromTj = (tjPeers ?? [])
    .filter((peer) => String((peer as { cleaner_id?: string }).cleaner_id ?? "").trim() !== cleanerId)
    .reduce(
      (sum, peer) => sum + Math.max(0, Math.round(Number((peer as { payout_cents?: number }).payout_cents) || 0)),
      0,
    );

  const othersTotal = Math.max(othersFromSummary, othersFromTj);
  const cappedTeamTotal = othersTotal + displayCents;
  const cap = bookingPayoutConstraintCapCents(row);
  if (cappedTeamTotal > cap) {
    return {
      ok: false,
      error: `Team payout R${Math.round(cappedTeamTotal / 100)} exceeds visit financial cap R${Math.round(cap / 100)}.`,
      code: "payout_exceeds_financial_cap",
    };
  }

  const rosterRole = String(roster.find((r) => String(r.cleaner_id ?? "").trim() === cleanerId)?.role ?? "")
    .trim()
    .toLowerCase();
  const role: "lead" | "member" = rosterRole === "lead" || hybridOwner ? "lead" : "member";

  const updatedSummary = summary
    ? upsertEarningsSummaryForCleaner(summary, cleanerId, payoutCents, bonusCents, role)
    : null;

  const patch: Record<string, unknown> = {};
  if (updatedSummary) {
    patch.earnings_summary = updatedSummary;
    patch.cleaner_earnings_total_cents = updatedSummary.total_cleaner_earnings_cents;
    patch.company_revenue_cents = updatedSummary.company_revenue_cents;
  }

  // Only the booking hybrid owner may rewrite top-level solo columns.
  if (hybridOwner) {
    patch.cleaner_payout_cents = payoutCents;
    patch.cleaner_bonus_cents = bonusCents;
    patch.display_earnings_cents = displayCents;
    if (!updatedSummary) {
      patch.cleaner_earnings_total_cents = displayCents;
      patch.company_revenue_cents = Math.max(0, cap - displayCents);
    }
  }

  const payoutStatus = String(row.payout_status ?? "").trim().toLowerCase();
  if (payoutStatus === "eligible" || payoutStatus === "paid") {
    if (updatedSummary) {
      patch.payout_frozen_cents = updatedSummary.total_cleaner_earnings_cents;
    } else if (hybridOwner) {
      patch.payout_frozen_cents = displayCents;
    }
  }

  if (Object.keys(patch).length > 0) {
    const { data: updated, error: upErr } = await admin
      .from("bookings")
      .update(patch)
      .eq("id", params.bookingId)
      .select("id");
    if (upErr) return { ok: false, error: upErr.message, code: "booking_update_failed" };
    if (!updated?.length) return { ok: false, error: "Booking could not be updated.", code: "booking_update_failed" };
  }

  if (hasTj) {
    const memberStatus = String((memberRow as { status?: string | null }).status ?? "")
      .trim()
      .toLowerCase();
    const tjQuery = admin
      .from("team_job_member_payouts")
      .update({ payout_cents: payoutCents })
      .eq("booking_id", params.bookingId)
      .eq("cleaner_id", cleanerId);
    const { error: teamUpErr } =
      memberStatus === "batched"
        ? await tjQuery.eq("status", "batched")
        : await tjQuery.eq("status", "pending");
    if (teamUpErr) return { ok: false, error: teamUpErr.message, code: "team_member_payout_update_failed" };
  }

  if (hasRosterPay) {
    const rosterStatus = String((rosterPayRow as { status?: string | null }).status ?? "")
      .trim()
      .toLowerCase();
    const rosterQuery = admin
      .from("booking_roster_member_payouts")
      .update({ payout_cents: payoutCents, bonus_cents: bonusCents })
      .eq("booking_id", params.bookingId)
      .eq("cleaner_id", cleanerId);
    const { error: rosterUpErr } =
      rosterStatus === "batched"
        ? await rosterQuery.eq("status", "batched")
        : await rosterQuery.eq("status", "pending");
    if (rosterUpErr) return { ok: false, error: rosterUpErr.message, code: "roster_member_payout_update_failed" };
  }

  const synced = await syncOpenPayoutBatchesForVisitEdit(admin, {
    cleanerId,
    bookingPayoutId: editable.payoutId,
    bookingDate: row.date,
    rosterCleanerPayoutId: String((rosterPayRow as { cleaner_payout_id?: string | null } | null)?.cleaner_payout_id ?? "").trim() || null,
  });
  if (!synced.ok) return { ok: false, error: synced.error, code: "batch_sync_failed" };
  const batchTotalCents = synced.batchTotalCents;

  const raw = await assertVisitEarningsReadAfterWrite(admin, {
    bookingId: params.bookingId,
    cleanerId,
    expectedTotalCents: displayCents,
  });
  if (!raw.ok) return { ok: false, error: raw.error, code: raw.code };

  const audit = await requireVisitEarningsAdjustAudit(admin, {
    bookingId: params.bookingId,
    cleanerId,
    payoutId: editable.payoutId,
    adminUserId: params.adminUserId,
    mode: "per_cleaner",
    previousTotalCents,
    newPayoutCents: payoutCents,
    newBonusCents: bonusCents,
    newTotalCents: displayCents,
    adjustmentNote: params.adjustmentNote,
    batchTotalCents,
  });
  if (!audit.ok) return audit;

  await logAdminEarningsAction(admin, {
    bookingId: params.bookingId,
    action: "manual_adjust",
    adminUserId: params.adminUserId,
  });

  void logSystemEvent({
    level: "info",
    source: "BOOKING_TEAM_MEMBER_PAYOUT_EARNINGS_ADJUSTED",
    message: "Admin manually adjusted per-cleaner visit payout earnings",
    context: {
      bookingId: params.bookingId,
      cleanerId,
      payoutId: editable.payoutId,
      adminUserId: params.adminUserId,
      previous_total_cents: previousTotalCents,
      payout_cents: payoutCents,
      bonus_cents: bonusCents,
      adjustment_note: params.adjustmentNote?.trim() || null,
      batch_total_cents: batchTotalCents,
      synced_payout_ids: synced.syncedPayoutIds,
      hybrid_owner: hybridOwner,
    },
  });

  return { ok: true, payoutId: editable.payoutId, batchTotalCents };
}
