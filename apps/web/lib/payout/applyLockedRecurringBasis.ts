import type { CanonicalPayoutResult, CanonicalEarningsAdjustment } from "@/lib/payout/canonicalCleanerPayout";
import { buildBookingEarningsSummary, payableEarningsFromSummaryRow } from "@/lib/payout/bookingEarningsSummary";

/** Apply the persisted fixed per-visit policy before summaries/member rows are written. */
export function applyLockedRecurringBasis(
  result: CanonicalPayoutResult,
  baseCents: number,
  adjustments: CanonicalEarningsAdjustment[],
): CanonicalPayoutResult {
  if (!Number.isSafeInteger(baseCents) || baseCents <= 0 || !result.earningsSummary) {
    throw new Error("locked_recurring_earnings_basis_invalid");
  }
  const previous = result.earningsSummary;
  const ids = previous.per_cleaner_earnings.map(row => row.cleaner_id);
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error("locked_recurring_participants_invalid");
  const perCleanerBaseCents = new Map(ids.map(id => [id, baseCents]));
  const summary = buildBookingEarningsSummary({
    serviceType: previous.service_type,
    customerTotalCents: previous.customer_total_cents,
    eligibleAmountCents: previous.eligible_amount_cents,
    isTeamJob: previous.payout_mode === "team",
    teamId: previous.assigned_team_id,
    teamLeaderId: previous.team_leader_id,
    participantCleanerIds: ids,
    rosterRoles: previous.per_cleaner_earnings.map(row => ({ cleaner_id: row.cleaner_id, role: row.role })),
    perCleanerBaseCents,
    adjustments,
    tenureMonths: null,
    cleanerPercentage: null,
    fixedServicePayoutApplied: previous.fixed_service_payout_applied,
    minimumEarningCents: baseCents,
    maximumEarningCents: baseCents,
    costsCents: previous.costs_cents,
    computedAtIso: previous.computed_at,
  });
  const lead = summary.per_cleaner_earnings.find(row => row.role === "lead") ?? summary.per_cleaner_earnings[0];
  const payable = payableEarningsFromSummaryRow(lead);
  return {
    ...result,
    displayEarningsCents: baseCents,
    payoutEarningsCents: lead.total_cents,
    cleanerPayoutCents: payable.payoutCents,
    cleanerBonusCents: payable.bonusCents,
    internalEarningsCents: summary.total_cleaner_earnings_cents,
    companyRevenueFromServiceCents: summary.company_revenue_cents,
    payoutPercentage: null,
    earningsPercentageApplied: null,
    earningsCapCentsApplied: baseCents,
    earningsModelVersion: "legacy_july_locked_v1",
    earningsSummary: summary,
    perCleanerBaseCents,
    diagnostics: { ...result.diagnostics, final_display_cents: baseCents, payout_percentage: null },
  };
}
