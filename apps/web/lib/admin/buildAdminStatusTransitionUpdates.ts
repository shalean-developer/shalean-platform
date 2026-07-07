import { buildCompletionCoherencePatch } from "@/lib/booking/bookingCompletionIntegrity";
import { bookingIsRecurringPendingPayment } from "@/lib/cleaner/cleanerRecurringPendingPaymentLifecycle";
import { canonicalDbBookingStatus } from "@/lib/booking/canonicalBookingStatus";

export type AdminStatusTransitionBeforeRow = {
  status?: string | null;
  completed_at?: string | null;
  dispatch_status?: string | null;
};

export type AdminStatusTransitionUpdatesResult = {
  updates: Record<string, unknown>;
  completionDispatchNormalized: boolean;
  beforeStatus: string;
  nextStatus: string;
};

/**
 * Build `bookings.update` payload for an admin lifecycle status override.
 */
export function buildAdminStatusTransitionUpdates(
  beforeRow: AdminStatusTransitionBeforeRow,
  nextStatusRaw: string,
  opts?: { adminEmail?: string | null; adminUserId?: string | null },
): AdminStatusTransitionUpdatesResult {
  const beforeStatus = canonicalDbBookingStatus(String(beforeRow.status ?? "pending").trim() || "pending");
  const nextStatus = canonicalDbBookingStatus(nextStatusRaw);
  const updates: Record<string, unknown> = { status: nextStatus };
  let completionDispatchNormalized = false;

  const beforeCompletedAt =
    beforeRow.completed_at != null && String(beforeRow.completed_at).trim()
      ? String(beforeRow.completed_at).trim()
      : null;

  if (nextStatus === "cancelled") {
    updates.cancelled_by = "system";
  }

  if (nextStatus === "completed") {
    const { patch: completionCoherencePatch, dispatchStatusNormalized } = buildCompletionCoherencePatch({
      beforeCompletedAt,
      beforeDispatchStatus: beforeRow.dispatch_status ?? null,
      fillCompletedAtIfMissing: true,
    });
    Object.assign(updates, completionCoherencePatch);
    completionDispatchNormalized = dispatchStatusNormalized;

    if (bookingIsRecurringPendingPayment(beforeRow as unknown as Record<string, unknown>)) {
      updates.admin_recurring_unpaid_completion_override_at = new Date().toISOString();
      updates.admin_recurring_unpaid_completion_override_by =
        (typeof opts?.adminEmail === "string" && opts.adminEmail.trim()) || opts?.adminUserId || null;
    }
  }

  if (beforeStatus === "completed" && nextStatus !== "completed") {
    updates.completed_at = null;
  }

  if (beforeStatus === "cancelled" && nextStatus !== "cancelled") {
    updates.cancelled_by = null;
  }

  return { updates, completionDispatchNormalized, beforeStatus, nextStatus };
}
