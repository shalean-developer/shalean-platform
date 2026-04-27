import "server-only";

export type CustomerRetentionState = "active" | "at_risk" | "churned";

export type CustomerRetentionInput = {
  /** ISO date string of last non-cancelled paid booking (service date or completed_at). */
  lastBookingActivityAt: string | null;
  nowMs?: number;
};

function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, (toMs - fromMs) / (24 * 60 * 60 * 1000));
}

function atRiskDays(): number {
  const raw = Number(process.env.GROWTH_RETENTION_AT_RISK_DAYS ?? "45");
  return Number.isFinite(raw) ? Math.min(365, Math.max(7, Math.round(raw))) : 45;
}

function churnedDays(): number {
  const raw = Number(process.env.GROWTH_RETENTION_CHURNED_DAYS ?? "120");
  return Number.isFinite(raw) ? Math.min(730, Math.max(atRiskDays() + 1, Math.round(raw))) : 120;
}

/**
 * Classifies a customer for retention automation (no side effects).
 */
export function evaluateCustomerRetentionState(customer: CustomerRetentionInput): CustomerRetentionState {
  const now = customer.nowMs ?? Date.now();
  if (!customer.lastBookingActivityAt) return "churned";
  const last = Date.parse(customer.lastBookingActivityAt);
  if (!Number.isFinite(last)) return "churned";
  const d = daysBetween(last, now);
  if (d >= churnedDays()) return "churned";
  if (d >= atRiskDays()) return "at_risk";
  return "active";
}
