import type { SupabaseClient } from "@supabase/supabase-js";
import { logAdminEarningsAction } from "@/lib/admin/logAdminEarningsAction";
import { payrollCleanerId } from "@/lib/admin/payouts/officePayoutPeriodReport";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { BOOKING_PAYOUT_COLUMNS_CLEAR } from "@/lib/payout/bookingPayoutColumns";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import { resetBookingCleanerLineEarnings } from "@/lib/payout/resetBookingCleanerLineEarnings";
import { syncPayoutBatchFromBookings } from "@/lib/payout/syncPayoutBatchFromBookings";

const EDITABLE_BATCH_STATUSES = new Set(["pending", "frozen"]);

type BookingRow = {
  id: string;
  status: string | null;
  cleaner_id: string | null;
  payout_owner_cleaner_id: string | null;
  selected_cleaner_id: string | null;
  payout_id: string | null;
  payout_status: string | null;
  payout_paid_at: string | null;
  is_team_job: boolean | null;
};

type RosterRow = {
  cleaner_id: string;
  role: string;
  payout_weight: number;
  lead_bonus_cents: number;
  source: string | null;
};

async function assertVisitPayoutEditable(
  admin: SupabaseClient,
  row: BookingRow,
): Promise<{ ok: true; payoutId: string | null } | { ok: false; error: string; code: string }> {
  if (row.is_team_job === true) {
    return {
      ok: false,
      error: "Team job payouts must be adjusted on the booking detail page (roster split).",
      code: "team_job_not_supported",
    };
  }

  const payoutStatus = String(row.payout_status ?? "").trim().toLowerCase();
  if (payoutStatus === "paid" || row.payout_paid_at) {
    return { ok: false, error: "Visit payout is already paid.", code: "booking_payout_paid" };
  }

  const payoutId = String(row.payout_id ?? "").trim() || null;
  if (!payoutId) return { ok: true, payoutId: null };

  const { data: batch, error: batchErr } = await admin
    .from("cleaner_payouts")
    .select("status, payout_run_id")
    .eq("id", payoutId)
    .maybeSingle();
  if (batchErr) return { ok: false, error: batchErr.message, code: "payout_lookup_failed" };
  if (!batch) return { ok: false, error: "Linked payout batch not found.", code: "payout_not_found" };

  const batchStatus = String((batch as { status?: string }).status ?? "").toLowerCase();
  const payoutRunId = String((batch as { payout_run_id?: string | null }).payout_run_id ?? "").trim();
  if (payoutRunId) {
    return {
      ok: false,
      error: "Payout is part of a disbursement run; edit the batch before freezing the run.",
      code: "payout_run_locked",
    };
  }
  if (!EDITABLE_BATCH_STATUSES.has(batchStatus)) {
    return {
      ok: false,
      error: "Payout batch is approved or paid; visit payout cannot be removed.",
      code: "payout_batch_locked",
    };
  }

  return { ok: true, payoutId };
}

function clearEarningsPatch(): Record<string, unknown> {
  return {
    ...BOOKING_PAYOUT_COLUMNS_CLEAR,
    display_earnings_cents: null,
    cleaner_earnings_total_cents: null,
    payout_frozen_cents: null,
    payout_status: "pending",
  };
}

/**
 * Removes a cleaner's payout attribution for a completed visit (wrong assignment).
 * Solo jobs: clears assignment + earnings so the visit can be reassigned.
 * Paired roster jobs: removes the cleaner from `booking_cleaners` and recomputes earnings.
 */
export async function removeCleanerFromVisitPayout(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    cleanerId: string;
    reason?: string | null;
    adminUserId: string;
  },
): Promise<
  | { ok: true; payoutId: string | null; batchTotalCents: number | null; mode: "unassigned" | "roster_removed" }
  | { ok: false; error: string; code?: string }
> {
  const bookingId = String(params.bookingId ?? "").trim();
  const cleanerId = String(params.cleanerId ?? "").trim();
  if (!bookingId || !cleanerId) {
    return { ok: false, error: "Missing booking or cleaner id.", code: "invalid_params" };
  }

  const { data: booking, error: loadErr } = await admin
    .from("bookings")
    .select(
      "id, status, cleaner_id, payout_owner_cleaner_id, selected_cleaner_id, payout_id, payout_status, payout_paid_at, is_team_job",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message, code: "booking_load_failed" };
  if (!booking) return { ok: false, error: "Booking not found.", code: "booking_not_found" };

  const row = booking as BookingRow;
  if (String(row.status ?? "").toLowerCase() !== "completed") {
    return { ok: false, error: "Only completed visits can be removed from payout.", code: "booking_not_completed" };
  }

  const editable = await assertVisitPayoutEditable(admin, row);
  if (!editable.ok) return editable;

  const payoutId = editable.payoutId;

  const { data: rosterRows, error: rosterErr } = await admin
    .from("booking_cleaners")
    .select("cleaner_id, role, payout_weight, lead_bonus_cents, source")
    .eq("booking_id", bookingId);
  if (rosterErr) return { ok: false, error: rosterErr.message, code: "roster_load_failed" };

  const members = (rosterRows ?? []) as RosterRow[];
  const rosterHasTarget = members.some((m) => String(m.cleaner_id) === cleanerId);
  const primary = payrollCleanerId(row);
  const primaryIsTarget = primary === cleanerId;

  if (!primaryIsTarget && !rosterHasTarget) {
    return {
      ok: false,
      error: "This cleaner is not attributed on this visit.",
      code: "cleaner_not_on_visit",
    };
  }

  const otherRosterMembers = members.filter((m) => String(m.cleaner_id) !== cleanerId);

  if (otherRosterMembers.length > 0) {
    const rpcRows = otherRosterMembers.map((m) => ({
      cleaner_id: m.cleaner_id,
      role: m.role,
      payout_weight: m.payout_weight,
      lead_bonus_cents: m.lead_bonus_cents,
      source: m.source ?? "admin_remove_visit_payout",
    }));

    const { error: rpcErr } = await admin.rpc("replace_booking_cleaners_admin_atomic", {
      p_booking_id: bookingId,
      p_rows: rpcRows,
    });
    if (rpcErr) {
      return { ok: false, error: rpcErr.message, code: "roster_replace_failed" };
    }

    const reset = await resetBookingCleanerLineEarnings(admin, bookingId);
    if (!reset.ok) return { ok: false, error: reset.error, code: "earnings_reset_failed" };

    const leadId =
      otherRosterMembers.find((m) => String(m.role).toLowerCase() === "lead")?.cleaner_id ??
      otherRosterMembers[0]?.cleaner_id ??
      null;
    if (leadId) {
      const persisted = await persistCleanerPayoutIfUnset({
        admin,
        bookingId,
        cleanerId: leadId,
        forceDisplayRecompute: true,
      });
      if (!persisted.ok) {
        return { ok: false, error: persisted.error, code: persisted.code ?? "earnings_persist_failed" };
      }
    }

    let batchTotalCents: number | null = null;
    if (payoutId) {
      const synced = await syncPayoutBatchFromBookings(admin, payoutId);
      if (!synced.ok) return { ok: false, error: synced.error, code: "batch_sync_failed" };
      batchTotalCents = synced.totalCents;
    }

    await logAdminEarningsAction(admin, {
      bookingId,
      action: "manual_adjust",
      adminUserId: params.adminUserId,
    });

    void logSystemEvent({
      level: "info",
      source: "BOOKING_CLEANER_VISIT_PAYOUT_REMOVED",
      message: "Admin removed cleaner from visit payout (roster)",
      context: {
        bookingId,
        cleanerId,
        payoutId,
        adminUserId: params.adminUserId,
        reason: params.reason?.trim() || null,
        mode: "roster_removed",
        batch_total_cents: batchTotalCents,
      },
    });

    return { ok: true, payoutId, batchTotalCents, mode: "roster_removed" };
  }

  const payoutStatus = String(row.payout_status ?? "").trim().toLowerCase();
  if (payoutStatus === "eligible") {
    const { error: thawErr } = await admin.from("bookings").update({ payout_status: "pending" }).eq("id", bookingId);
    if (thawErr) return { ok: false, error: thawErr.message, code: "booking_thaw_failed" };
  }

  const assignmentPatch: Record<string, unknown> = {
    ...clearEarningsPatch(),
    payout_id: null,
  };
  if (String(row.cleaner_id ?? "") === cleanerId) assignmentPatch.cleaner_id = null;
  if (String(row.payout_owner_cleaner_id ?? "") === cleanerId) assignmentPatch.payout_owner_cleaner_id = null;
  if (String(row.selected_cleaner_id ?? "") === cleanerId) assignmentPatch.selected_cleaner_id = null;

  const { data: updated, error: upErr } = await admin.from("bookings").update(assignmentPatch).eq("id", bookingId).select("id");
  if (upErr) return { ok: false, error: upErr.message, code: "booking_update_failed" };
  if (!updated?.length) return { ok: false, error: "Booking could not be updated.", code: "booking_update_failed" };

  if (members.some((m) => String(m.cleaner_id) === cleanerId)) {
    const { error: delErr } = await admin
      .from("booking_cleaners")
      .delete()
      .eq("booking_id", bookingId)
      .eq("cleaner_id", cleanerId);
    if (delErr) return { ok: false, error: delErr.message, code: "roster_delete_failed" };
  }

  const reset = await resetBookingCleanerLineEarnings(admin, bookingId);
  if (!reset.ok) return { ok: false, error: reset.error, code: "earnings_reset_failed" };

  let batchTotalCents: number | null = null;
  if (payoutId) {
    const synced = await syncPayoutBatchFromBookings(admin, payoutId);
    if (!synced.ok) return { ok: false, error: synced.error, code: "batch_sync_failed" };
    batchTotalCents = synced.totalCents;
  }

  await logAdminEarningsAction(admin, {
    bookingId,
    action: "manual_adjust",
    adminUserId: params.adminUserId,
  });

  void logSystemEvent({
    level: "info",
    source: "BOOKING_CLEANER_VISIT_PAYOUT_REMOVED",
    message: "Admin removed cleaner from visit payout (unassigned)",
    context: {
      bookingId,
      cleanerId,
      payoutId,
      adminUserId: params.adminUserId,
      reason: params.reason?.trim() || null,
      mode: "unassigned",
      batch_total_cents: batchTotalCents,
    },
  });

  return { ok: true, payoutId, batchTotalCents, mode: "unassigned" };
}
