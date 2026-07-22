/**
 * Canonical visit-edit classifier for cleaner payout adjustments.
 * Do not route solely on `bookings.is_team_job`.
 */

import { parseBookingEarningsSummary } from "@/lib/payout/bookingEarningsSummary";

export type VisitPayoutEditMode = "solo_owner" | "per_cleaner";

export type VisitPayoutEditClassificationInput = {
  is_team_job?: boolean | null;
  cleaner_id?: string | null;
  payout_owner_cleaner_id?: string | null;
  team_id?: string | null;
  earnings_summary?: unknown;
  /** Cleaner ids from `booking_cleaners`. */
  rosterCleanerIds?: readonly string[] | null;
  /** Whether `team_job_member_payouts` has a row for the requested cleaner. */
  hasTeamMemberPayoutRow?: boolean;
  /** Whether `booking_roster_member_payouts` has a row for the requested cleaner. */
  hasRosterMemberPayoutRow?: boolean;
  /** Cleaner selected in the office edit UI / API body. */
  requestedCleanerId?: string | null;
};

function uniqIds(ids: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function payrollOwnerCleanerId(input: {
  cleaner_id?: string | null;
  payout_owner_cleaner_id?: string | null;
}): string | null {
  const owner = String(input.payout_owner_cleaner_id ?? "").trim();
  if (owner) return owner;
  const primary = String(input.cleaner_id ?? "").trim();
  return primary || null;
}

/**
 * Classify whether an earnings edit should rewrite booking-level hybrid columns (solo owner)
 * or per-cleaner rails (summary / team_job_member_payouts / roster member payouts).
 */
export function classifyVisitPayoutEdit(input: VisitPayoutEditClassificationInput): VisitPayoutEditMode {
  const requested = String(input.requestedCleanerId ?? "").trim();
  const summary = parseBookingEarningsSummary(input.earnings_summary);
  const summaryIds = uniqIds((summary?.per_cleaner_earnings ?? []).map((row) => row.cleaner_id));
  const rosterIds = uniqIds(input.rosterCleanerIds ?? []);
  const ownerId = payrollOwnerCleanerId(input);

  const multiCleanerSignals =
    input.is_team_job === true ||
    rosterIds.length > 1 ||
    summaryIds.length > 1 ||
    input.hasTeamMemberPayoutRow === true ||
    input.hasRosterMemberPayoutRow === true ||
    summary?.payout_mode === "team";

  if (multiCleanerSignals) {
    // Editing a non-owner on any multi-cleaner shape must use per-cleaner persistence.
    if (requested && ownerId && requested !== ownerId) return "per_cleaner";
    // Formal team / multi summary / TJ / roster-member rows always use per-cleaner writer.
    if (
      input.is_team_job === true ||
      summaryIds.length > 1 ||
      input.hasTeamMemberPayoutRow === true ||
      input.hasRosterMemberPayoutRow === true ||
      rosterIds.length > 1
    ) {
      return "per_cleaner";
    }
  }

  // Requested cleaner is on the visit only via member rails (even if is_team_job is false).
  if (requested && input.hasTeamMemberPayoutRow) return "per_cleaner";
  if (requested && input.hasRosterMemberPayoutRow) return "per_cleaner";
  if (requested && summaryIds.length > 0 && summaryIds.includes(requested) && ownerId && requested !== ownerId) {
    return "per_cleaner";
  }

  return "solo_owner";
}

/** Whether booking hybrid columns (`cleaner_payout_cents` / `display_earnings_cents`) belong to this cleaner. */
export function isBookingHybridOwner(
  input: {
    cleaner_id?: string | null;
    payout_owner_cleaner_id?: string | null;
  },
  cleanerId: string,
): boolean {
  const target = String(cleanerId ?? "").trim();
  if (!target) return false;
  const owner = payrollOwnerCleanerId(input);
  return owner === target;
}
