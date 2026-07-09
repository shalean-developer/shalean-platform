import type { SupabaseClient } from "@supabase/supabase-js";
import { invalidateCleanerAvailabilityCache } from "@/lib/admin/cleanerAvailabilityCache";
import { applyAdminBookingLifecycleStatusOverride } from "@/lib/admin/adminBookingLifecycleStatusOverrideCommand";
import { isAllowedAdminBookingStatusChange } from "@/lib/admin/adminBookingStatusOptions";
import { buildAdminStatusTransitionUpdates } from "@/lib/admin/buildAdminStatusTransitionUpdates";
import { normalizeTimeHm } from "@/lib/admin/validateAdminBookingSlot";
import { bookingIsRecurringPendingPayment } from "@/lib/cleaner/cleanerRecurringPendingPaymentLifecycle";
import { scheduleStuckEarningsRecomputeDebounced } from "@/lib/cleaner/scheduleStuckEarningsRecompute";
import {
  isBookingTerminalForCleanerWorkloadSync,
  loadCleanerIdsLinkedToBooking,
  syncCleanersBusyAfterBookingTerminalByBookingId,
  syncCleanersBusyAfterBookingTerminalChange,
} from "@/lib/cleaner/syncCleanerStatus";
import { ensureCleanerEarningsLedgerRow } from "@/lib/payout/ensureCleanerEarningsLedger";
import {
  fetchBookingDisplayEarningsCents,
  hasPersistedDisplayEarningsBasis,
  isCompletableDisplayEarningsCents,
  resolvePersistCleanerIdForBooking,
} from "@/lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { canonicalDbBookingStatus } from "@/lib/booking/canonicalBookingStatus";
import { evaluateCleanerJobCompletionGate } from "@/lib/cleaner/cleanerJobCompletionGate";

export type PerformAdminBookingStatusChangeParams = {
  admin: SupabaseClient;
  bookingId: string;
  status: string;
  reason: string;
  adminUserId: string;
  adminEmail?: string | null;
};

export type PerformAdminBookingStatusChangeResult =
  | { ok: true; fromStatus: string; toStatus: string }
  | { ok: false; status: number; error: string; code?: string };

const BEFORE_SELECT =
  "id, status, completed_at, dispatch_status, cleaner_id, payout_owner_cleaner_id, date, time, display_earnings_cents, is_team_job, started_at, duration_minutes, estimated_duration_minutes, pricing_summary, booking_snapshot";

export async function performAdminBookingStatusChange(
  params: PerformAdminBookingStatusChangeParams,
): Promise<PerformAdminBookingStatusChangeResult> {
  const { admin, bookingId, adminUserId } = params;
  const reason = params.reason.trim().slice(0, 500);
  if (reason.length < 3) {
    return { ok: false, status: 400, error: "A reason of at least 3 characters is required.", code: "reason_required" };
  }

  if (!isAllowedAdminBookingStatusChange(params.status)) {
    return { ok: false, status: 400, error: "Invalid status.", code: "invalid_status" };
  }

  const { data: before, error: loadErr } = await admin
    .from("bookings")
    .select(BEFORE_SELECT)
    .eq("id", bookingId)
    .maybeSingle();

  if (loadErr) return { ok: false, status: 500, error: loadErr.message };
  if (!before) return { ok: false, status: 404, error: "Booking not found." };

  const beforeRow = before as {
    status?: string | null;
    completed_at?: string | null;
    dispatch_status?: string | null;
    cleaner_id?: string | null;
    payout_owner_cleaner_id?: string | null;
    date?: string | null;
    time?: string | null;
    display_earnings_cents?: unknown;
    is_team_job?: boolean | null;
    started_at?: string | null;
    duration_minutes?: number | null;
    estimated_duration_minutes?: number | null;
    pricing_summary?: unknown;
    booking_snapshot?: unknown;
  };

  const beforeStatus = canonicalDbBookingStatus(String(beforeRow.status ?? "pending").trim() || "pending");
  const nextStatus = canonicalDbBookingStatus(params.status);

  if (beforeStatus === nextStatus) {
    return { ok: false, status: 400, error: "Booking is already in that status.", code: "status_unchanged" };
  }

  const beforeCompletedAt =
    beforeRow.completed_at != null && String(beforeRow.completed_at).trim()
      ? String(beforeRow.completed_at).trim()
      : null;

  const { updates, completionDispatchNormalized, beforeStatus: fromStatus, nextStatus: toStatus } =
    buildAdminStatusTransitionUpdates(beforeRow, nextStatus, {
      adminEmail: params.adminEmail,
      adminUserId,
      completionGateOverrideReason: reason,
    });

  const completionGate =
    toStatus === "completed" ? evaluateCleanerJobCompletionGate(beforeRow) : null;

  const { error: updateErr } = await applyAdminBookingLifecycleStatusOverride({
    admin,
    bookingId,
    updates,
  });
  if (updateErr) return { ok: false, status: 500, error: updateErr.message };

  if (toStatus === "completed" && bookingIsRecurringPendingPayment(before as unknown as Record<string, unknown>)) {
    await logSystemEvent({
      level: "warn",
      source: "admin_booking_lifecycle_override",
      message: "admin_marked_completed_recurring_unpaid_pending_payment",
      context: {
        booking_id: bookingId,
        admin_user_id: adminUserId,
        admin_email: params.adminEmail ?? null,
        prior_status: fromStatus,
        override_type: "recurring_unpaid_completion",
        reason,
      },
    });
  }

  if (toStatus === "completed" && completionGate && !completionGate.ok) {
    await logSystemEvent({
      level: "warn",
      source: "admin_booking_lifecycle_override",
      message: "admin_marked_completed_completion_gate_override",
      context: {
        booking_id: bookingId,
        admin_user_id: adminUserId,
        admin_email: params.adminEmail ?? null,
        prior_status: fromStatus,
        override_type: "completion_gate",
        gate_codes: completionGate.blockedCodes,
        reason,
      },
    });
  }

  const completedViaChange = toStatus === "completed";
  const wasAlreadyCompleted = fromStatus === "completed";
  const needsEarningsIntegrityGate = completedViaChange && !wasAlreadyCompleted;

  async function revertBookingCompletionOnly(): Promise<void> {
    const patch: Record<string, unknown> = {
      status: fromStatus,
      completed_at: fromStatus === "completed" ? beforeCompletedAt : null,
    };
    if (completionDispatchNormalized) {
      patch.dispatch_status = beforeRow.dispatch_status ?? null;
    }
    await admin.from("bookings").update(patch).eq("id", bookingId);
  }

  if (completedViaChange) {
    const { data: postRow, error: postErr } = await admin
      .from("bookings")
      .select("cleaner_id, payout_owner_cleaner_id, is_team_job, display_earnings_cents")
      .eq("id", bookingId)
      .maybeSingle();

    if (postErr || !postRow) {
      if (needsEarningsIntegrityGate) {
        await revertBookingCompletionOnly();
        await reportOperationalIssue("error", "admin_booking_change_status", "post-update refetch failed (completion gate)", {
          bookingId,
          error: postErr?.message ?? "null_row",
        });
        return { ok: false, status: 500, error: "Booking refetch failed after update." };
      }
    } else {
      const persistCleanerId = resolvePersistCleanerIdForBooking(
        postRow as {
          cleaner_id?: string | null;
          payout_owner_cleaner_id?: string | null;
          is_team_job?: boolean | null;
        },
      );

      if (needsEarningsIntegrityGate && !persistCleanerId) {
        await revertBookingCompletionOnly();
        return {
          ok: false,
          status: 400,
          error: "Cannot mark completed without a cleaner or team payout owner for earnings.",
          code: "missing_cleaner_for_completion",
        };
      }

      if (persistCleanerId) {
        try {
          const payout = await persistCleanerPayoutIfUnset({ admin, bookingId, cleanerId: persistCleanerId });
          if (needsEarningsIntegrityGate && !payout.ok) {
            await revertBookingCompletionOnly();
            return { ok: false, status: 500, error: payout.error ?? "Earnings persist failed." };
          }
          if (needsEarningsIntegrityGate) {
            const displayCents = await fetchBookingDisplayEarningsCents(admin, bookingId);
            if (!isCompletableDisplayEarningsCents(displayCents)) {
              await revertBookingCompletionOnly();
              return { ok: false, status: 500, error: "Earnings verification failed after completion." };
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (needsEarningsIntegrityGate) {
            await revertBookingCompletionOnly();
            return { ok: false, status: 500, error: msg || "Earnings persist failed." };
          }
        }
      }
    }
  }

  const { data: intr0 } = await admin
    .from("bookings")
    .select("status, display_earnings_cents, cleaner_id, payout_owner_cleaner_id, is_team_job")
    .eq("id", bookingId)
    .maybeSingle();
  const intrStatus = String(intr0?.status ?? "").toLowerCase();
  if (intrStatus === "completed" && !hasPersistedDisplayEarningsBasis((intr0 as { display_earnings_cents?: unknown }).display_earnings_cents)) {
    const intrPid = resolvePersistCleanerIdForBooking(
      intr0 as {
        cleaner_id?: string | null;
        payout_owner_cleaner_id?: string | null;
        is_team_job?: boolean | null;
      },
    );
    if (intrPid) {
      try {
        await persistCleanerPayoutIfUnset({ admin, bookingId, cleanerId: intrPid });
      } catch {
        /* final gate below */
      }
      scheduleStuckEarningsRecomputeDebounced({
        admin,
        bookingId,
        cleanerId: intrPid,
        recomputeSource: "admin_patch_final_integrity",
      });
    }
    const { data: intr1 } = await admin.from("bookings").select("display_earnings_cents").eq("id", bookingId).maybeSingle();
    if (!hasPersistedDisplayEarningsBasis((intr1 as { display_earnings_cents?: unknown } | null)?.display_earnings_cents)) {
      await syncCleanersBusyAfterBookingTerminalByBookingId(admin, bookingId, {
        cleaner_id: (intr0 as { cleaner_id?: string | null }).cleaner_id,
        payout_owner_cleaner_id: (intr0 as { payout_owner_cleaner_id?: string | null }).payout_owner_cleaner_id,
      });
      return {
        ok: false,
        status: 422,
        error: "Completed booking has missing earnings — integrity violation.",
        code: "INTEGRITY_COMPLETED_MISSING_EARNINGS",
      };
    }
  }

  if (intrStatus === "completed") {
    void ensureCleanerEarningsLedgerRow({ admin, bookingId });
  }

  const bd = typeof beforeRow.date === "string" ? beforeRow.date.trim() : "";
  const bt = normalizeTimeHm(String(beforeRow.time ?? ""));
  if (/^\d{4}-\d{2}-\d{2}$/.test(bd) && /^\d{2}:\d{2}$/.test(bt)) {
    invalidateCleanerAvailabilityCache(bd, bt);
  }

  const { data: postPatchStatus } = await admin.from("bookings").select("status").eq("id", bookingId).maybeSingle();
  const patchedStatus = String(
    (postPatchStatus as { status?: string | null } | null)?.status ?? toStatus,
  );

  if (isBookingTerminalForCleanerWorkloadSync(patchedStatus)) {
    const linkedIds = await loadCleanerIdsLinkedToBooking(admin, bookingId, {
      cleaner_id: beforeRow.cleaner_id,
      payout_owner_cleaner_id: beforeRow.payout_owner_cleaner_id,
    });
    await syncCleanersBusyAfterBookingTerminalChange(admin, linkedIds);
  }

  const { error: auditErr } = await admin.from("booking_changes").insert({
    booking_id: bookingId,
    changed_by: adminUserId,
    before: { status: fromStatus },
    after: { status: toStatus },
    summary: {
      type: "admin_status_change",
      from_status: fromStatus,
      to_status: toStatus,
      reason,
      admin_email: params.adminEmail ?? null,
    },
  });
  if (auditErr) {
    void reportOperationalIssue("warn", "admin_booking_change_status", "booking_changes insert failed", {
      bookingId,
      message: auditErr.message,
    });
  }

  await logSystemEvent({
    level: "info",
    source: "admin_booking_change_status",
    message: "admin_booking_status_changed",
    context: {
      booking_id: bookingId,
      admin_user_id: adminUserId,
      admin_email: params.adminEmail ?? null,
      from_status: fromStatus,
      to_status: toStatus,
      reason,
    },
  });

  return { ok: true, fromStatus, toStatus };
}
