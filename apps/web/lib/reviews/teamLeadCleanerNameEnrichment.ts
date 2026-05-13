/**
 * Server-side, roster-safe enrichment of `BookingRow` payloads with the
 * lead-cleaner display name for team jobs. Pure helpers extracted so M-15's
 * scoping (lead-only, never the roster) and behaviour (only fires when the
 * solo-cleaner embed cannot resolve a name) are exhaustively unit-testable
 * without a Supabase client.
 *
 * Design constraints (locked in by tests):
 *
 *   - **Lead-only.** {@link extractTeamLeadCleanerIdsForEnrichment} returns
 *     only `payout_owner_cleaner_id` values that are already on rows we are
 *     about to return — never any `team_members.cleaner_id` lookup. This
 *     is what keeps M-15 from accidentally exposing the rest of the team
 *     roster through the customer dashboard payload.
 *
 *   - **Solo bookings unaffected.** Rows with a non-null `cleaner_id`
 *     (the canonical solo-cleaner case) are skipped entirely — those
 *     already resolve their cleaner name through the `cleaners(full_name)`
 *     embed in `CUSTOMER_BOOKING_SELECT`.
 *
 *   - **H-8 alignment.** Team-assigned bookings clear `cleaner_id` and
 *     carry the lead in `payout_owner_cleaner_id`. The eligibility filter
 *     in {@link bookingIsReviewSubmissionEligibleAssignee} matches on the
 *     same priority, so the name surfaced here is the same cleaner the
 *     review submission API will write into `reviews.cleaner_id`.
 *
 *   - **No payout / no submission semantics changed.** This module only
 *     READS `payout_owner_cleaner_id` and writes a NEW optional
 *     `payout_owner_cleaner_name` field on the row. Payout ownership and
 *     `evaluateCustomerReviewSubmissionEligibility` are untouched.
 *
 * @module teamLeadCleanerNameEnrichment
 */

import type { BookingRow } from "@/lib/dashboard/types";

/**
 * Minimal row shape the enricher needs. Keeps the helper decoupled from
 * the full {@link BookingRow} so admin / test fixtures can call it without
 * pulling the full dashboard type surface.
 */
export type TeamLeadEnrichableRow = Pick<
  BookingRow,
  "is_team_job" | "cleaner_id" | "payout_owner_cleaner_id"
> & { payout_owner_cleaner_name?: string | null };

/**
 * Return the (de-duplicated) lead-cleaner UUIDs that need a `cleaners`
 * lookup so {@link cleanerFromRow} can render a name for team-assigned
 * bookings. Empty array when no enrichment is needed (single batched
 * query in the caller; see `loadCustomerBookingRowsForUser`).
 */
export function extractTeamLeadCleanerIdsForEnrichment(
  rows: readonly TeamLeadEnrichableRow[],
): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    if (r.is_team_job !== true) continue;
    const cid = String(r.cleaner_id ?? "").trim();
    // Solo-cleaner embed already covers this case — never widen.
    if (cid) continue;
    const lid = String(r.payout_owner_cleaner_id ?? "").trim();
    if (!lid) continue;
    out.add(lid);
  }
  return Array.from(out);
}

/**
 * In-place merge: for every team-job row whose lead-cleaner UUID has a
 * resolved name in `nameById`, set `payout_owner_cleaner_name`. Solo
 * bookings, team-jobs without a lead UUID, and team-jobs whose lead is
 * absent from `nameById` are left untouched.
 *
 * Returns the count of rows actually mutated — handy for ops metrics
 * (helps spot pages where the enricher noisily fires on every row).
 */
export function applyTeamLeadCleanerNamesToRows(
  rows: readonly TeamLeadEnrichableRow[],
  nameById: ReadonlyMap<string, string>,
): number {
  let mutated = 0;
  for (const r of rows) {
    if (r.is_team_job !== true) continue;
    const cid = String(r.cleaner_id ?? "").trim();
    if (cid) continue;
    const lid = String(r.payout_owner_cleaner_id ?? "").trim();
    if (!lid) continue;
    const name = nameById.get(lid);
    if (typeof name === "string" && name.trim()) {
      r.payout_owner_cleaner_name = name.trim();
      mutated += 1;
    }
  }
  return mutated;
}
