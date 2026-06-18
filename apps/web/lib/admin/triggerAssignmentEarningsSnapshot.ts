import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  triggerPersistCleanerPayoutIfCompleted,
  triggerPersistPreCompletionAssignmentDisplayEarnings,
} from "@/lib/admin/adminBookingPostCreatePipeline";

/**
 * M-8 — assignment-mutation snapshot trigger.
 *
 * Centralised wrapper that every code path mutating cleaner assignment on a
 * `bookings` row (or its `booking_cleaners` roster) MUST call after the
 * mutation has been persisted. Before M-8 this snapshot was only run from
 * `runAdminBookingPostCreateNormalizationAndEarnings`, leaving reassignment,
 * dispatch-offer accept, team admin, emergency roster and decline-redispatch
 * paths without a guaranteed `display_earnings_cents` write for monthly
 * bookings (cleaner dashboard rendered "earnings unavailable" until the
 * cron-driven stuck-earnings recompute caught up).
 *
 * Coverage rules — same gating as the admin POST pipeline:
 *  - `completed`                                     → {@link triggerPersistCleanerPayoutIfCompleted}
 *  - assigned / in_progress + pre-completion basis   → {@link triggerPersistPreCompletionAssignmentDisplayEarnings}
 *    (paid solo per-booking, invoice-backed monthly, paid team)
 *  - Anything else (`pending`, `pending_payment`,
 *    `pending_assignment`, unpaid assigned,
 *    `cancelled`, `failed`)                          → no-op
 *
 * Idempotency: both inner triggers delegate to `persistCleanerPayoutIfUnset`,
 * which is a no-op when a `display_earnings_cents` basis is already persisted
 * for the booking. Calling this helper multiple times for the same booking
 * (e.g. dispatch-offer accept + later admin override) does not produce
 * duplicate ledger rows or rewrite earnings.
 *
 * Constraints (M-8 scope):
 *  - This helper does not change payout formulas — it is purely a snapshot
 *    trigger that runs the existing eligibility-gated persist helper.
 *  - This helper does not change assignment selection logic — it only fires
 *    after a caller has already persisted the cleaner mutation.
 *
 * @see runAdminBookingPostCreateNormalizationAndEarnings — original entry
 * point used by admin booking create. Kept untouched for M-8; this helper
 * mirrors only the earnings-snapshot portion (no `ensureBookingAssignedStatusInvariant`).
 */
export async function triggerAssignmentEarningsSnapshotForBooking(
  admin: SupabaseClient,
  bookingId: string,
  logSource: string,
): Promise<void> {
  await triggerPersistCleanerPayoutIfCompleted(admin, bookingId, logSource);
  await triggerPersistPreCompletionAssignmentDisplayEarnings(admin, bookingId, logSource);
}
