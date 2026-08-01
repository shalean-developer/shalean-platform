/**
 * Structured earnings summary persisted on `bookings.earnings_summary` (JSONB).
 * Pure helpers — no Supabase.
 */

import type { CanonicalPayoutResult, CanonicalEarningsAdjustment } from "@/lib/payout/canonicalCleanerPayout";
import { CANONICAL_EARNINGS_MODEL_VERSION } from "@/lib/payout/canonicalCleanerPayout";

export type PerCleanerEarningRow = {
  cleaner_id: string;
  role: "lead" | "member";
  base_earning_cents: number;
  bonus_cents: number;
  deduction_cents: number;
  total_cents: number;
};

export type EarningsAdjustmentItem = {
  type: string;
  amount_cents: number;
  reason?: string;
  cleaner_id?: string;
};

export type BookingEarningsSummary = {
  model_version: string;
  service_type: string;
  customer_total_cents: number;
  eligible_amount_cents: number;
  payout_mode: "individual_cleaners" | "team";
  cleaner_count: number;
  assigned_cleaner_ids: string[];
  assigned_team_id: string | null;
  team_leader_id: string | null;
  cleaner_tenure_months: number | null;
  cleaner_percentage: number | null;
  minimum_earning_cents: number;
  maximum_earning_cents: number;
  fixed_service_payout_applied: boolean;
  per_cleaner_earnings: PerCleanerEarningRow[];
  team_leader_earning_cents: number | null;
  bonus: { items: EarningsAdjustmentItem[]; total_cents: number };
  deductions: { items: EarningsAdjustmentItem[]; total_cents: number };
  total_cleaner_earnings_cents: number;
  costs_cents: number;
  company_revenue_cents: number;
  computed_at: string;
};

export type BuildEarningsSummaryParams = {
  serviceType: string;
  customerTotalCents: number;
  eligibleAmountCents: number;
  isTeamJob: boolean;
  teamId?: string | null;
  teamLeaderId?: string | null;
  participantCleanerIds: string[];
  rosterRoles?: Array<{ cleaner_id: string; role?: string | null }> | null;
  perCleanerBaseCents: Map<string, number>;
  adjustments?: CanonicalEarningsAdjustment[] | null;
  tenureMonths: number | null;
  cleanerPercentage: number | null;
  fixedServicePayoutApplied: boolean;
  minimumEarningCents: number;
  maximumEarningCents: number;
  costsCents?: number;
  computedAtIso?: string;
};

function resolveRole(
  cleanerId: string,
  teamLeaderId: string | null,
  rosterRoles?: Array<{ cleaner_id: string; role?: string | null }> | null,
): "lead" | "member" {
  if (teamLeaderId && cleanerId === teamLeaderId) return "lead";
  const row = rosterRoles?.find((r) => r.cleaner_id === cleanerId);
  if (String(row?.role ?? "").toLowerCase() === "lead") return "lead";
  return "member";
}

function partitionAdjustments(adjustments: CanonicalEarningsAdjustment[]): {
  bonuses: EarningsAdjustmentItem[];
  deductions: EarningsAdjustmentItem[];
} {
  const bonuses: EarningsAdjustmentItem[] = [];
  const deductions: EarningsAdjustmentItem[] = [];
  for (const adj of adjustments) {
    const amount = Math.floor(Number(adj.amount_cents) || 0);
    if (amount === 0) continue;
    const item: EarningsAdjustmentItem = {
      type: adj.type ?? (amount > 0 ? "admin_adjustment" : "deduction"),
      amount_cents: Math.abs(amount),
      reason: adj.reason,
      cleaner_id: adj.cleaner_id,
    };
    if (amount > 0) bonuses.push(item);
    else deductions.push(item);
  }
  return { bonuses, deductions };
}

export function buildBookingEarningsSummary(params: BuildEarningsSummaryParams): BookingEarningsSummary {
  const participantIds = [...new Set(params.participantCleanerIds.map((id) => String(id).trim()).filter(Boolean))];
  const teamLeaderId = params.teamLeaderId?.trim() || null;
  const adjustments = params.adjustments ?? [];
  const { bonuses, deductions } = partitionAdjustments(adjustments);

  const bonusByCleaner = new Map<string, number>();
  const deductionByCleaner = new Map<string, number>();
  for (const b of bonuses) {
    const cid = b.cleaner_id?.trim();
    if (!cid) continue;
    bonusByCleaner.set(cid, (bonusByCleaner.get(cid) ?? 0) + b.amount_cents);
  }
  for (const d of deductions) {
    const cid = d.cleaner_id?.trim();
    if (!cid) continue;
    deductionByCleaner.set(cid, (deductionByCleaner.get(cid) ?? 0) + d.amount_cents);
  }

  const perCleanerEarnings: PerCleanerEarningRow[] = participantIds.map((cleanerId) => {
    const base = Math.max(0, Math.floor(params.perCleanerBaseCents.get(cleanerId) ?? 0));
    const bonus = bonusByCleaner.get(cleanerId) ?? 0;
    const deduction = deductionByCleaner.get(cleanerId) ?? 0;
    return {
      cleaner_id: cleanerId,
      role: resolveRole(cleanerId, teamLeaderId, params.rosterRoles),
      base_earning_cents: base,
      bonus_cents: bonus,
      deduction_cents: deduction,
      total_cents: Math.max(0, base + bonus - deduction),
    };
  });

  const totalCleanerEarnings = perCleanerEarnings.reduce((s, r) => s + r.total_cents, 0);
  const bonusTotal = bonuses.reduce((s, b) => s + b.amount_cents, 0);
  const deductionTotal = deductions.reduce((s, d) => s + d.amount_cents, 0);
  const costsCents = Math.max(0, Math.floor(params.costsCents ?? 0));
  const customerTotal = Math.max(0, Math.floor(params.customerTotalCents));
  const companyRevenue = Math.max(0, customerTotal - totalCleanerEarnings - costsCents);

  const leaderRow = perCleanerEarnings.find((r) => r.role === "lead") ?? null;

  return {
    model_version: CANONICAL_EARNINGS_MODEL_VERSION,
    service_type: params.serviceType,
    customer_total_cents: customerTotal,
    eligible_amount_cents: Math.max(0, Math.floor(params.eligibleAmountCents)),
    payout_mode: params.isTeamJob ? "team" : "individual_cleaners",
    cleaner_count: participantIds.length || (params.isTeamJob ? 0 : 1),
    assigned_cleaner_ids: participantIds,
    assigned_team_id: params.teamId?.trim() || null,
    team_leader_id: teamLeaderId,
    cleaner_tenure_months: params.tenureMonths,
    cleaner_percentage: params.cleanerPercentage,
    minimum_earning_cents: params.minimumEarningCents,
    maximum_earning_cents: params.maximumEarningCents,
    fixed_service_payout_applied: params.fixedServicePayoutApplied,
    per_cleaner_earnings: perCleanerEarnings,
    team_leader_earning_cents: leaderRow?.total_cents ?? null,
    bonus: { items: bonuses, total_cents: bonusTotal },
    deductions: { items: deductions, total_cents: deductionTotal },
    total_cleaner_earnings_cents: totalCleanerEarnings,
    costs_cents: costsCents,
    company_revenue_cents: companyRevenue,
    computed_at: params.computedAtIso ?? new Date().toISOString(),
  };
}

export type CleanerFacingEarnings = {
  job_earning_cents: number;
  bonus_cents: number;
  deduction_cents: number;
  total_cents: number;
};

/** Cleaner-safe slice — never includes company revenue. */
export function resolveCleanerFacingEarnings(
  summary: BookingEarningsSummary | null | undefined,
  cleanerId: string,
): CleanerFacingEarnings | null {
  if (!summary) return null;
  const cid = cleanerId.trim();
  const row = summary.per_cleaner_earnings.find((r) => r.cleaner_id === cid);
  if (!row) return null;
  return {
    job_earning_cents: row.base_earning_cents,
    bonus_cents: row.bonus_cents,
    deduction_cents: row.deduction_cents,
    total_cents: row.total_cents,
  };
}

export type AdminEarningsDisplayRow = {
  cleaner_id: string;
  cleaner_name: string | null;
  role: "lead" | "member";
  base_earning_zar: number;
  bonus_zar: number;
  deduction_zar: number;
  total_zar: number;
};

export type AdminEarningsDisplay = {
  customer_total_zar: number;
  eligible_amount_zar: number;
  total_cleaner_earnings_zar: number;
  team_leader_earning_zar: number | null;
  bonus_total_zar: number;
  deductions_total_zar: number;
  company_revenue_zar: number;
  per_cleaner: AdminEarningsDisplayRow[];
  payout_mode: "individual_cleaners" | "team";
  fixed_service_payout_applied: boolean;
};

function centsToZar(cents: number): number {
  return Math.round(cents) / 100;
}

export function resolveAdminEarningsDisplay(
  summary: BookingEarningsSummary | null | undefined,
  cleanerNameById: Map<string, string> | Record<string, string>,
): AdminEarningsDisplay | null {
  if (!summary) return null;
  const nameMap = cleanerNameById instanceof Map ? cleanerNameById : new Map(Object.entries(cleanerNameById));

  return {
    customer_total_zar: centsToZar(summary.customer_total_cents),
    eligible_amount_zar: centsToZar(summary.eligible_amount_cents),
    total_cleaner_earnings_zar: centsToZar(summary.total_cleaner_earnings_cents),
    team_leader_earning_zar:
      summary.team_leader_earning_cents != null ? centsToZar(summary.team_leader_earning_cents) : null,
    bonus_total_zar: centsToZar(summary.bonus.total_cents),
    deductions_total_zar: centsToZar(summary.deductions.total_cents),
    company_revenue_zar: centsToZar(summary.company_revenue_cents),
    per_cleaner: summary.per_cleaner_earnings.map((r) => ({
      cleaner_id: r.cleaner_id,
      cleaner_name: nameMap.get(r.cleaner_id) ?? null,
      role: r.role,
      base_earning_zar: centsToZar(r.base_earning_cents),
      bonus_zar: centsToZar(r.bonus_cents),
      deduction_zar: centsToZar(r.deduction_cents),
      total_zar: centsToZar(r.total_cents),
    })),
    payout_mode: summary.payout_mode,
    fixed_service_payout_applied: summary.fixed_service_payout_applied,
  };
}

export function parseBookingEarningsSummary(raw: unknown): BookingEarningsSummary | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as BookingEarningsSummary;
  if (typeof o.model_version !== "string" || !Array.isArray(o.per_cleaner_earnings)) return null;
  return o;
}

function rebuildSummaryTotals(summary: BookingEarningsSummary, per_cleaner_earnings: PerCleanerEarningRow[]): BookingEarningsSummary {
  const total_cleaner_earnings_cents = per_cleaner_earnings.reduce((sum, row) => sum + row.total_cents, 0);
  const company_revenue_cents = Math.max(
    0,
    summary.customer_total_cents - total_cleaner_earnings_cents - (summary.costs_cents ?? 0),
  );
  const leadRow = per_cleaner_earnings.find((row) => row.role === "lead") ?? per_cleaner_earnings[0] ?? null;
  return {
    ...summary,
    per_cleaner_earnings,
    cleaner_count: per_cleaner_earnings.length,
    assigned_cleaner_ids: per_cleaner_earnings.map((row) => row.cleaner_id),
    total_cleaner_earnings_cents,
    company_revenue_cents,
    team_leader_earning_cents: leadRow?.total_cents ?? null,
    computed_at: new Date().toISOString(),
  };
}

/** Keep `earnings_summary` aligned when admins manually edit per-visit payout amounts. */
export function patchEarningsSummaryForCleaner(
  summary: BookingEarningsSummary,
  cleanerId: string,
  payoutCents: number,
  bonusCents: number,
): BookingEarningsSummary | null {
  const target = String(cleanerId ?? "").trim();
  if (!target) return null;
  if (!summary.per_cleaner_earnings.some((row) => row.cleaner_id === target)) return null;

  const per_cleaner_earnings = summary.per_cleaner_earnings.map((row) => {
    if (row.cleaner_id !== target) return row;
    const deduction = Math.max(0, Math.round(row.deduction_cents ?? 0));
    const base = Math.max(0, Math.round(payoutCents));
    const bonus = Math.max(0, Math.round(bonusCents));
    const total = Math.max(0, base + bonus - deduction);
    return {
      ...row,
      base_earning_cents: base,
      bonus_cents: bonus,
      total_cents: total,
    };
  });
  return rebuildSummaryTotals(summary, per_cleaner_earnings);
}

/**
 * Remap a drifted snapshot/summary owner onto the authoritative cleaner without changing amounts.
 * Returns null when no remap is needed or inputs are invalid.
 */
export function remapEarningsSummaryCleanerId(
  summary: BookingEarningsSummary,
  fromCleanerId: string,
  toCleanerId: string,
): BookingEarningsSummary | null {
  const from = String(fromCleanerId ?? "").trim();
  const to = String(toCleanerId ?? "").trim();
  if (!from || !to || from === to) return null;
  if (!summary.per_cleaner_earnings.some((row) => row.cleaner_id === from)) return null;
  if (summary.per_cleaner_earnings.some((row) => row.cleaner_id === to)) return null;

  const per_cleaner_earnings = summary.per_cleaner_earnings.map((row) =>
    row.cleaner_id === from ? { ...row, cleaner_id: to } : row,
  );
  const next = rebuildSummaryTotals(summary, per_cleaner_earnings);
  return {
    ...next,
    team_leader_id: summary.team_leader_id === from ? to : summary.team_leader_id,
    assigned_cleaner_ids: per_cleaner_earnings.map((row) => row.cleaner_id),
  };
}

/**
 * Patch an existing per-cleaner row, or insert one when the cleaner is only on TJ/roster rails.
 */
export function upsertEarningsSummaryForCleaner(
  summary: BookingEarningsSummary,
  cleanerId: string,
  payoutCents: number,
  bonusCents: number,
  role: "lead" | "member" = "member",
): BookingEarningsSummary | null {
  const target = String(cleanerId ?? "").trim();
  if (!target) return null;
  const patched = patchEarningsSummaryForCleaner(summary, target, payoutCents, bonusCents);
  if (patched) return patched;

  const base = Math.max(0, Math.round(payoutCents));
  const bonus = Math.max(0, Math.round(bonusCents));
  const per_cleaner_earnings: PerCleanerEarningRow[] = [
    ...summary.per_cleaner_earnings,
    {
      cleaner_id: target,
      role,
      base_earning_cents: base,
      bonus_cents: bonus,
      deduction_cents: 0,
      total_cents: Math.max(0, base + bonus),
    },
  ];
  return rebuildSummaryTotals(summary, per_cleaner_earnings);
}

export function summaryPerCleanerDisplayCents(
  summary: BookingEarningsSummary | null | undefined,
  cleanerId: string,
): number | null {
  const facing = resolveCleanerFacingEarnings(summary, cleanerId);
  return facing?.total_cents ?? null;
}

export function mergeCanonicalResultWithSummary(
  result: CanonicalPayoutResult,
  summary: BookingEarningsSummary,
): CanonicalPayoutResult {
  return {
    ...result,
    earningsSummary: summary,
    companyRevenueFromServiceCents: summary.company_revenue_cents,
    internalEarningsCents: summary.total_cleaner_earnings_cents,
  };
}
