import "server-only";

import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { normalizeUuidCandidate } from "@/lib/booking/userSelectedCleanerFromSnapshot";

/**
 * **M-6**: pick the customer's preferred cleaner for a spawned recurring occurrence.
 *
 * Order of precedence (first non-null wins):
 *   1. `recurring_bookings.preferred_cleaner_id` — explicit, mutable, admin/customer-editable.
 *   2. `booking_snapshot_template.locked.cleaner_id` — legacy / inferred at intake time.
 *   3. `booking_snapshot_template.cleaner_id`       — top-level snapshot mirror, last resort.
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
  snapshotTemplate: BookingSnapshotV1 | null;
}): string | null {
  const fromColumn = normalizeUuidCandidate(input.recurringPreferredCleanerId ?? null);
  if (fromColumn) return fromColumn;

  const tpl = input.snapshotTemplate;
  if (!tpl) return null;

  const fromLocked = normalizeUuidCandidate(tpl.locked?.cleaner_id ?? null);
  if (fromLocked) return fromLocked;

  const fromTopLevel = normalizeUuidCandidate(tpl.cleaner_id ?? null);
  return fromTopLevel;
}

/**
 * Builds the partial `bookings` row patch that propagates the preferred cleaner onto a
 * generated occurrence. Mirrors the customer-facing intake path
 * (`insertBookingFromFlowIntake`): when a preferred cleaner is set the row records the
 * customer's intent (`selected_cleaner_id` + `assignment_type='user_selected'`) but leaves
 * `cleaner_id` NULL so the post-payment dispatch offer (or, for monthly billing, the
 * post-finalize dispatch sweep) decides honour-vs-fallback per occurrence.
 *
 * Returns an empty object when no preferred cleaner is resolved — keeps existing
 * dispatch-from-scratch behaviour for plans without a pick.
 */
export function recurringOccurrenceCleanerPatch(preferredCleanerId: string | null): {
  selected_cleaner_id?: string;
  assignment_type?: "user_selected";
  cleaner_id?: null;
} {
  if (!preferredCleanerId) return {};
  return {
    selected_cleaner_id: preferredCleanerId,
    assignment_type: "user_selected" as const,
    cleaner_id: null,
  };
}
