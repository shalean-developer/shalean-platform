import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import {
  resolvePersistCleanerIdForBooking,
  type BookingPersistIdsRow,
} from "@/lib/payout/bookingEarningsIntegrity";
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
      "cleaner_id, selected_cleaner_id, status, assigned_at, cleaner_response_status, dispatch_status, assignment_type",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !r) return;

  const st = String((r as { status?: string | null }).status ?? "").trim().toLowerCase();
  const asgType = String((r as { assignment_type?: string | null }).assignment_type ?? "").trim().toLowerCase();
  /** Marketplace user-pick: assignment only via {@link acceptDispatchOffer}; do not mirror selected → cleaner_id here. */
  if (asgType === "user_selected" || st === "pending_assignment") {
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
  if (st === "pending" && hasCleanerRef) {
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
 */
export async function triggerPersistMonthlyAssignedDisplayEarnings(
  admin: SupabaseClient,
  bookingId: string,
  logSource: string,
): Promise<void> {
  const { data: b, error } = await admin
    .from("bookings")
    .select(
      "status, cleaner_id, payout_owner_cleaner_id, is_team_job, billing_type, is_monthly_billing_booking, monthly_invoice_id",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !b) return;

  const st = String((b as { status?: string | null }).status ?? "").trim().toLowerCase();
  if (st === "completed") return;
  if (st !== "assigned" && st !== "in_progress") return;

  const billingType = String((b as { billing_type?: string | null }).billing_type ?? "").trim().toLowerCase();
  const monthlyInvoiceId = (b as { monthly_invoice_id?: string | null }).monthly_invoice_id;
  const monthlyInvoiceLinked = monthlyInvoiceId != null && String(monthlyInvoiceId).trim() !== "";
  const isMonthlyManaged =
    (b as { is_monthly_billing_booking?: boolean | null }).is_monthly_billing_booking === true ||
    billingType === "recurring_invoice" ||
    billingType === "monthly_contract" ||
    monthlyInvoiceLinked;
  if (!isMonthlyManaged) return;

  const cleanerId = resolvePersistCleanerIdForBooking(b as BookingPersistIdsRow);
  if (!cleanerId) return;

  void logSystemEvent({
    level: "info",
    source: logSource,
    message: "earnings_trigger_persist_monthly_assigned_basis",
    context: { bookingId, cleanerId, status: st },
  });

  const payout = await persistCleanerPayoutIfUnset({ admin, bookingId, cleanerId });
  if (!payout.ok) {
    void reportOperationalIssue("warn", logSource, payout.error ?? "persist_monthly_assigned_failed", {
      bookingId,
      cleanerId,
    });
    return;
  }
  if (payout.skipped) {
    void logSystemEvent({
      level: "info",
      source: logSource,
      message: "monthly_assigned_earnings_persist_skipped",
      context: { bookingId, cleanerId, skipReason: payout.skipReason },
    });
  }
}

export async function runAdminBookingPostCreateNormalizationAndEarnings(
  admin: SupabaseClient,
  bookingId: string,
  logSource: string,
): Promise<void> {
  await ensureBookingAssignedStatusInvariant(admin, bookingId);
  await triggerPersistCleanerPayoutIfCompleted(admin, bookingId, logSource);
  await triggerPersistMonthlyAssignedDisplayEarnings(admin, bookingId, logSource);
}
