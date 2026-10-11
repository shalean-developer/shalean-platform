import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { buildCompletionCoherencePatch } from "@/lib/booking/bookingCompletionIntegrity";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import {
  resolvePersistCleanerIdForBooking,
  type BookingPersistIdsRow,
} from "@/lib/payout/bookingEarningsIntegrity";
import { evaluatePersistCleanerPayoutEligibility } from "@/lib/payout/bookingPayoutPersistEligibility";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pure mirror of DB constraint `bookings_assigned_requires_status` (operational `pending`
 * must not coexist with cleaner_id / selected_cleaner_id).
 */
export function bookingViolatesCleanerAssignedWhilePending(row: {
  status?: string | null;
  cleaner_id?: string | null;
  selected_cleaner_id?: string | null;
}): boolean {
  const st = String(row.status ?? "").trim().toLowerCase();
  if (st !== "pending") return false;
  const c = String(row.cleaner_id ?? "").trim();
  const s = String(row.selected_cleaner_id ?? "").trim();
  return c.length > 0 || s.length > 0;
}

/**
 * Aligns `cleaner_id` from `selected_cleaner_id` when missing, and promotes `pending` → `assigned`
 * when any cleaner reference exists (matches `bookings_assigned_requires_status`).
 */
export async function ensureBookingAssignedStatusInvariant(
  admin: SupabaseClient,
  bookingId: string,
): Promise<void> {
  const { data: r, error } = await admin
    .from("bookings")
    .select(
      "cleaner_id, selected_cleaner_id, status, assigned_at, cleaner_response_status, dispatch_status, assignment_type, is_recurring_generated, is_monthly_billing_booking, billing_type",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !r) return;

  const st = String((r as { status?: string | null }).status ?? "").trim().toLowerCase();
  const asgType = String((r as { assignment_type?: string | null }).assignment_type ?? "").trim().toLowerCase();
  const isRecurringMonthlyContinuity =
    (r as { is_recurring_generated?: boolean | null }).is_recurring_generated === true &&
    ((r as { is_monthly_billing_booking?: boolean | null }).is_monthly_billing_booking === true ||
      String((r as { billing_type?: string | null }).billing_type ?? "")
        .trim()
        .toLowerCase() === "recurring_invoice");

  /** Marketplace user-pick: assignment only via {@link acceptDispatchOffer}; do not mirror selected → cleaner_id here. */
  if ((asgType === "user_selected" || st === "pending_assignment") && !isRecurringMonthlyContinuity) {
    return;
  }
  const cleanerId = String((r as { cleaner_id?: string | null }).cleaner_id ?? "").trim();
  const selectedId = String((r as { selected_cleaner_id?: string | null }).selected_cleaner_id ?? "").trim();
  const cleanerOk = UUID_RE.test(cleanerId);
  const selectedOk = UUID_RE.test(selectedId);

  const patch: Record<string, unknown> = {};
  if (selectedOk && !cleanerOk) {
    patch.cleaner_id = selectedId;
  }

  const hasCleanerRef = cleanerOk || selectedOk;
  const shouldPromotePending =
    (st === "pending" || (isRecurringMonthlyContinuity && st === "pending_assignment")) && hasCleanerRef;
  if (shouldPromotePending) {
    patch.status = "assigned";
    const crsRaw = (r as { cleaner_response_status?: string | null }).cleaner_response_status;
    patch.cleaner_response_status =
      crsRaw != null && String(crsRaw).trim() !== "" ? String(crsRaw).trim() : CLEANER_RESPONSE.PENDING;
    const assignedRaw = (r as { assigned_at?: string | null }).assigned_at;
    if (assignedRaw == null || !String(assignedRaw).trim()) {
      patch.assigned_at = new Date().toISOString();
    }
    const ds = String((r as { dispatch_status?: string | null }).dispatch_status ?? "").trim().toLowerCase();
    if (ds === "searching" || ds === "offered" || ds === "failed" || ds === "") {
      patch.dispatch_status = "assigned";
    }
  }

  if (Object.keys(patch).length === 0) return;
  const { error: uErr } = await admin.from("bookings").update(patch).eq("id", bookingId);
  if (uErr) {
    void reportOperationalIssue("warn", "ensureBookingAssignedStatusInvariant", uErr.message, { bookingId });
  }
}

/**
 * Promote a newly-created admin monthly booking to completed only after canonical
 * line items have persisted and duplicate-race resolution has succeeded.
 *
 * Keeping this write in the canonical admin post-create pipeline preserves the
 * H-16 status-write boundary and prevents a child-write failure from leaving a
 * completed booking without canonical pricing lines.
 */
export async function promoteAdminMonthlyBookingToCompleted(params: {
  admin: SupabaseClient;
  bookingId: string;
  completedAtIso: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { admin, bookingId, completedAtIso } = params;
  const { data: current, error: readErr } = await admin
    .from("bookings")
    .select("status, completed_at, dispatch_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (readErr || !current) {
    return { ok: false, error: readErr?.message ?? "booking_missing" };
  }

  const status = String((current as { status?: string | null }).status ?? "").trim().toLowerCase();
  if (status === "completed") return { ok: true };
  if (status !== "assigned") {
    return { ok: false, error: `unexpected_precompletion_status:${status || "empty"}` };
  }

  const { patch } = buildCompletionCoherencePatch({
    beforeCompletedAt: (current as { completed_at?: string | null }).completed_at ?? null,
    beforeDispatchStatus: (current as { dispatch_status?: string | null }).dispatch_status ?? null,
    fillCompletedAtIfMissing: true,
    nowIso: completedAtIso,
  });

  const { error: updateErr } = await admin
    .from("bookings")
    .update({
      status: "completed",
      ...patch,
      cleaner_response_status: CLEANER_RESPONSE.COMPLETED,
      updated_at: completedAtIso,
    })
    .eq("id", bookingId)
    .eq("status", "assigned");

  if (updateErr) return { ok: false, error: updateErr.message };
  return { ok: true };
}

/**
 * @deprecated Prefer {@link ensureBookingAssignedStatusInvariant}; kept as an alias for existing imports.
 */
export async function normalizeAdminBookingCleanerFromPreferred(
  admin: SupabaseClient,
  bookingId: string,
): Promise<void> {
  await ensureBookingAssignedStatusInvariant(admin, bookingId);
}

/**
 * Runs `persistCleanerPayoutIfUnset` only when the booking is already `completed`
 * (line-level earnings + ledger are handled inside that path).
 */
export async function triggerPersistCleanerPayoutIfCompleted(
  admin: SupabaseClient,
  bookingId: string,
  logSource: string,
): Promise<void> {
  const { data: b, error } = await admin
    .from("bookings")
    .select("status, cleaner_id, payout_owner_cleaner_id, is_team_job")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !b) {
    void reportOperationalIssue("warn", logSource, error?.message ?? "booking_missing", { bookingId });
    return;
  }
  const st = String((b as { status?: string | null }).status ?? "").toLowerCase();
  if (st !== "completed") {
    void logSystemEvent({
      level: "info",
      source: logSource,
      message: "earnings_skipped_status_not_completed",
      context: { bookingId, status: st || null },
    });
    return;
  }
  const cleanerId = resolvePersistCleanerIdForBooking(b as BookingPersistIdsRow);
  if (!cleanerId) {
    void logSystemEvent({
      level: "warn",
      source: logSource,
      message: "earnings_skipped_no_cleaner_for_payout",
      context: { bookingId },
    });
    return;
  }
  void logSystemEvent({
    level: "info",
    source: logSource,
    message: "earnings_trigger_persist_cleaner_payout",
    context: { bookingId, cleanerId },
  });
  const payout = await persistCleanerPayoutIfUnset({ admin, bookingId, cleanerId });
  if (!payout.ok) {
    void reportOperationalIssue("warn", logSource, payout.error ?? "persistCleanerPayoutIfUnset failed", {
      bookingId,
      cleanerId,
    });
  }
}

/**
 * Persist `display_earnings_cents` for assigned / in-progress bookings that qualify for
 * pre-completion assignment basis (paid solo per-booking, invoice-backed monthly, paid team).
 * Without this, cleaners see "Job earning unavailable" until completion or a cron repair.
 */
export async function triggerPersistPreCompletionAssignmentDisplayEarnings(
  admin: SupabaseClient,
  bookingId: string,
  logSource: string,
): Promise<void> {
  const { data: b, error } = await admin
    .from("bookings")
    .select(
      "status, cleaner_id, payout_owner_cleaner_id, is_team_job, team_id, billing_type, is_monthly_billing_booking, monthly_invoice_id, total_paid_zar, total_paid_cents, amount_paid_cents, payment_needs_follow_up, payment_status, paid_at, refunded_at, refund_status",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !b) return;

  const st = String((b as { status?: string | null }).status ?? "").trim().toLowerCase();
  if (st === "completed") return;
  if (st !== "assigned" && st !== "in_progress") return;

  const eligibility = evaluatePersistCleanerPayoutEligibility(b as Record<string, unknown>);
  if (!eligibility.allowed || eligibility.mode !== "pre_completion_assignment_basis") return;

  const cleanerId = resolvePersistCleanerIdForBooking(b as BookingPersistIdsRow);
  if (!cleanerId) return;

  void logSystemEvent({
    level: "info",
    source: logSource,
    message: "earnings_trigger_persist_pre_completion_assignment_basis",
    context: { bookingId, cleanerId, status: st },
  });

  const payout = await persistCleanerPayoutIfUnset({ admin, bookingId, cleanerId });
  if (!payout.ok) {
    void reportOperationalIssue("warn", logSource, payout.error ?? "pre_completion_assignment_persist_failed", {
      bookingId,
      cleanerId,
    });
    return;
  }
  if (payout.skipped) {
    void logSystemEvent({
      level: "info",
      source: logSource,
      message: "pre_completion_assignment_earnings_persist_skipped",
      context: { bookingId, cleanerId, skipReason: payout.skipReason },
    });
  }
}

export async function persistAdminMonthlyPreCompletionEarnings(params: {
  admin: SupabaseClient;
  bookingId: string;
  logSource: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { admin, bookingId, logSource } = params;

  await ensureBookingAssignedStatusInvariant(admin, bookingId);

  const { data: b, error: readErr } = await admin
    .from("bookings")
    .select(
      "status, cleaner_id, payout_owner_cleaner_id, is_team_job, team_id, billing_type, is_monthly_billing_booking, monthly_invoice_id, total_paid_zar, total_paid_cents, amount_paid_cents, payment_needs_follow_up, payment_status, paid_at, refunded_at, refund_status, display_earnings_cents",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (readErr || !b) {
    return { ok: false, error: readErr?.message ?? "booking_missing" };
  }

  const st = String((b as { status?: string | null }).status ?? "").trim().toLowerCase();
  if (st !== "assigned") {
    return { ok: false, error: `unexpected_precompletion_status:${st || "empty"}` };
  }

  const eligibility = evaluatePersistCleanerPayoutEligibility(b as Record<string, unknown>);
  if (!eligibility.allowed || eligibility.mode !== "pre_completion_assignment_basis") {
    return {
      ok: false,
      error: eligibility.allowed
        ? `unexpected_earnings_mode:${eligibility.mode}`
        : `precompletion_earnings_ineligible:${eligibility.skipReason}`,
    };
  }

  const cleanerId = resolvePersistCleanerIdForBooking(b as BookingPersistIdsRow);
  if (!cleanerId) return { ok: false, error: "precompletion_earnings_missing_cleaner" };

  const payout = await persistCleanerPayoutIfUnset({
    admin,
    bookingId,
    cleanerId,
    forceDisplayRecompute: true,
  });
  if (!payout.ok) {
    await reportOperationalIssue("error", logSource, payout.error ?? "pre_completion_assignment_persist_failed", {
      bookingId,
      cleanerId,
    });
    return { ok: false, error: payout.error ?? "pre_completion_assignment_persist_failed" };
  }
  if (payout.skipped) {
    return { ok: false, error: `precompletion_earnings_skipped:${payout.skipReason}` };
  }

  const { data: verifiedBooking, error: verifyErr } = await admin
    .from("bookings")
    .select("display_earnings_cents, is_team_job, payout_owner_cleaner_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (verifyErr || !verifiedBooking) {
    return { ok: false, error: verifyErr?.message ?? "precompletion_earnings_verify_missing" };
  }
  const display = Number((verifiedBooking as { display_earnings_cents?: number | null }).display_earnings_cents);
  if (!Number.isFinite(display) || display < 0) {
    return { ok: false, error: "precompletion_display_earnings_missing" };
  }

  const { data: rosterRows, error: rosterErr } = await admin
    .from("booking_cleaners")
    .select("cleaner_id, role")
    .eq("booking_id", bookingId);
  if (rosterErr) return { ok: false, error: rosterErr.message };

  const roster = (rosterRows ?? [])
    .map((row) => ({
      cleanerId: String((row as { cleaner_id?: string | null }).cleaner_id ?? "").trim(),
      role: String((row as { role?: string | null }).role ?? "").trim().toLowerCase(),
    }))
    .filter((row) => row.cleanerId);

  if ((verifiedBooking as { is_team_job?: boolean | null }).is_team_job === true) {
    const { data: teamRows, error: teamErr } = await admin
      .from("team_job_member_payouts")
      .select("cleaner_id")
      .eq("booking_id", bookingId);
    if (teamErr) return { ok: false, error: teamErr.message };
    if ((teamRows ?? []).length === 0) {
      return { ok: false, error: "precompletion_team_member_payouts_missing" };
    }
  } else if (roster.length > 1) {
    const payoutOwner = String(
      (verifiedBooking as { payout_owner_cleaner_id?: string | null }).payout_owner_cleaner_id ?? cleanerId,
    ).trim();
    const nonLeadIds = roster
      .filter((row) => row.cleanerId !== payoutOwner && row.role !== "lead")
      .map((row) => row.cleanerId);
    if (nonLeadIds.length > 0) {
      const { data: memberRows, error: memberErr } = await admin
        .from("booking_roster_member_payouts")
        .select("cleaner_id")
        .eq("booking_id", bookingId)
        .in("cleaner_id", nonLeadIds);
      if (memberErr) return { ok: false, error: memberErr.message };
      const actual = new Set(
        (memberRows ?? []).map((row) => String((row as { cleaner_id?: string | null }).cleaner_id ?? "").trim()),
      );
      const missing = nonLeadIds.filter((id) => !actual.has(id));
      if (missing.length > 0) {
        return { ok: false, error: `precompletion_roster_member_payouts_missing:${missing.join(",")}` };
      }
    }
  }

  return { ok: true };
}

/**
 * Monthly admin booking with a pre-selected cleaner skips the dispatch-offer funnel and writes
 * `cleaner_id` + `status='assigned'` directly. Without an offer snapshot
 * (`resolveAndPersistDispatchOfferEarningsSnapshot`), `bookings.display_earnings_cents` would stay
 * NULL until completion, causing the cleaner dashboard to render "earnings unavailable" for
 * upcoming monthly visits.
 *
 * `persistCleanerPayoutIfUnset` already supports this via
 * `evaluatePersistCleanerPayoutEligibility` returning `pre_completion_assignment_basis` for
 * invoice-backed solo rows. This helper is a safe no-op for per-booking rows, team rows without
 * an owner, completed rows (handled by {@link triggerPersistCleanerPayoutIfCompleted}), and rows
 * that don't satisfy the eligibility gate.
 *
 * @deprecated Prefer {@link triggerPersistPreCompletionAssignmentDisplayEarnings} — kept as a thin alias.
 */
export async function triggerPersistMonthlyAssignedDisplayEarnings(
  admin: SupabaseClient,
  bookingId: string,
  logSource: string,
): Promise<void> {
  await triggerPersistPreCompletionAssignmentDisplayEarnings(admin, bookingId, logSource);
}

export async function runAdminBookingPostCreateNormalizationAndEarnings(
  admin: SupabaseClient,
  bookingId: string,
  logSource: string,
): Promise<void> {
  await ensureBookingAssignedStatusInvariant(admin, bookingId);
  await triggerPersistCleanerPayoutIfCompleted(admin, bookingId, logSource);
  await triggerPersistPreCompletionAssignmentDisplayEarnings(admin, bookingId, logSource);
}
