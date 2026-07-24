import "server-only";

import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { normalizeUuidCandidate } from "@/lib/booking/userSelectedCleanerFromSnapshot";

/**
 * **M-6**: pick the customer's preferred cleaner for a spawned recurring occurrence.
 *
 * Order of precedence (first non-null wins):
 *   1. `recurring_bookings.preferred_cleaner_id` — explicit, mutable, admin/customer-editable.
 *   2. `lastAssignedCleanerId` — cleaner from the most recent prior occurrence on this plan.
 *   3. `booking_snapshot_template.locked.cleaner_id` — legacy / inferred at intake time.
 *   4. `booking_snapshot_template.cleaner_id`       — top-level snapshot mirror, last resort.
 *
 * Returning `null` is **not** an error: it just means the occurrence will dispatch without a
 * customer-picked cleaner (existing pre-M-6 behaviour).
 *
 * The function NEVER throws and NEVER touches the database — it only validates that each
 * candidate is a syntactically valid UUID. Existence / availability checks happen later at
 * dispatch time, never at generation time. This is deliberate: we are very far from the
 * service date when occurrences are spawned, so cleaner availability is not yet meaningful.
 * (Constraint from M-6: "Do not auto-assign unavailable cleaners.")
 */
export function resolveRecurringPreferredCleanerId(input: {
  recurringPreferredCleanerId: string | null | undefined;
  lastAssignedCleanerId?: string | null | undefined;
  snapshotTemplate: BookingSnapshotV1 | null;
}): string | null {
  const fromColumn = normalizeUuidCandidate(input.recurringPreferredCleanerId ?? null);
  if (fromColumn) return fromColumn;

  const fromLastOccurrence = normalizeUuidCandidate(input.lastAssignedCleanerId ?? null);
  if (fromLastOccurrence) return fromLastOccurrence;

  const tpl = input.snapshotTemplate;
  if (!tpl) return null;

  const fromLocked = normalizeUuidCandidate(tpl.locked?.cleaner_id ?? null);
  if (fromLocked) return fromLocked;

  const fromTopLevel = normalizeUuidCandidate(tpl.cleaner_id ?? null);
  return fromTopLevel;
}

/**
 * Recurring continuity assigns immediately for every open operational status except
 * `pending_payment` (per-booking Paystack — assign after payment finalize).
 */
export function recurringOccurrenceShouldDirectAssign(operationalStatus: string | null | undefined): boolean {
  const st = String(operationalStatus ?? "").trim().toLowerCase();
  if (!st || st === "pending_payment") return false;
  return (
    st === "pending" ||
    st === "pending_assignment" ||
    st === "assigned" ||
    st === "offered" ||
    st === "in_progress"
  );
}

/**
 * Maps a generated booking's current status to the patch mode used when propagating
 * plan edits onto existing occurrences.
 *
 * Terminal / lifecycle-active statuses must not collapse to `"pending"` — that path
 * forces `status: "assigned"` via {@link recurringOccurrenceCleanerPatch} and historically
 * left `completed_at` in place while excluding the visit from office earnings.
 */
export function recurringPropagateCleanerOperationalStatus(bookingStatus: string | null | undefined):
  | "pending"
  | "pending_payment"
  | "preserve_lifecycle" {
  const st = String(bookingStatus ?? "").trim().toLowerCase();
  if (st === "pending_payment") return "pending_payment";
  if (
    st === "completed" ||
    st === "cancelled" ||
    st === "failed" ||
    st === "payment_expired" ||
    st === "in_progress"
  ) {
    return "preserve_lifecycle";
  }
  return "pending";
}

/**
 * Whether a generated occurrence must keep its lifecycle columns when propagating
 * preferred-cleaner identity (completed visits with or without status drift).
 */
export function recurringOccurrenceMustPreserveLifecycle(row: {
  status?: string | null;
  completed_at?: string | null;
}): boolean {
  const st = String(row.status ?? "")
    .trim()
    .toLowerCase();
  if (st === "completed" || st === "cancelled" || st === "failed" || st === "payment_expired" || st === "in_progress") {
    return true;
  }
  return Boolean(String(row.completed_at ?? "").trim());
}

/**
 * Preferred-cleaner identity only — never rewrites status / response / assigned_at.
 * Used for completed (or completed_at-stamped) occurrences during plan propagate.
 */
export function recurringOccurrenceCleanerIdentityOnlyPatch(preferredCleanerId: string | null): {
  selected_cleaner_id?: string;
  assignment_type?: "user_selected";
  cleaner_id?: string;
} {
  if (!preferredCleanerId) return {};
  return {
    selected_cleaner_id: preferredCleanerId,
    cleaner_id: preferredCleanerId,
    assignment_type: "user_selected",
  };
}

/**
 * Builds the partial `bookings` row patch that propagates the preferred cleaner onto a
 * generated occurrence.
 *
 * - `pending_payment` (per-booking Paystack): records customer intent via
 *   `selected_cleaner_id`; `cleaner_id` stays null until post-payment dispatch.
 * - `preserve_lifecycle`: identity only (no status / response rewrite).
 * - All other open statuses (monthly invoice, repair, propagate): direct-assign for
 *   continuity — including `pending_assignment` rows stuck by ack-timeout / propagate.
 */
export function recurringOccurrenceCleanerPatch(
  preferredCleanerId: string | null,
  options?: { operationalStatus?: string | null },
): {
  selected_cleaner_id?: string;
  assignment_type?: "user_selected";
  cleaner_id?: string | null;
  status?: "assigned";
  assigned_at?: string;
  cleaner_response_status?: "pending";
  dispatch_status?: "assigned";
} {
  if (!preferredCleanerId) return {};

  const st = String(options?.operationalStatus ?? "").trim().toLowerCase();
  if (st === "pending_payment") {
    return {
      selected_cleaner_id: preferredCleanerId,
      assignment_type: "user_selected" as const,
      cleaner_id: null,
    };
  }

  if (st === "preserve_lifecycle") {
    return recurringOccurrenceCleanerIdentityOnlyPatch(preferredCleanerId);
  }

  if (recurringOccurrenceShouldDirectAssign(st)) {
    const now = new Date().toISOString();
    return {
      selected_cleaner_id: preferredCleanerId,
      cleaner_id: preferredCleanerId,
      assignment_type: "user_selected",
      status: "assigned",
      assigned_at: now,
      cleaner_response_status: "pending",
      dispatch_status: "assigned",
    };
  }

  return {
    selected_cleaner_id: preferredCleanerId,
    assignment_type: "user_selected" as const,
    cleaner_id: null,
  };
}
