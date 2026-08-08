import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSystemEvent } from "@/lib/logging/systemLog";
import {
  settleMonthlyInvoiceChildren,
  type MonthlyInvoiceSettlementChildRow,
} from "@/lib/monthlyInvoice/settleMonthlyInvoiceChildren";

export const DEFAULT_REPAIR_MONTHLY_CHILD_SETTLEMENT_LIMIT = 100;
export const DEFAULT_REPAIR_MONTHLY_CHILD_SETTLEMENT_SCAN = 1000;
export const MAX_REPAIR_MONTHLY_CHILD_SETTLEMENT_LIMIT = 300;
export const MAX_REPAIR_MONTHLY_CHILD_SETTLEMENT_SCAN = 5000;

export type PaidMonthlyInvoiceChildSettlementSkipReason =
  | "already_settled"
  | "invoice_not_paid"
  | "child_cancelled"
  | "refund_or_dispute_blocked"
  | "missing_earnings_basis"
  | "uncertain_team_payout_integrity";

export type RepairPaidMonthlyInvoiceChildSettlementDriftResult =
  | {
      ok: true;
      candidates_scanned: number;
      children_matched: number;
      invoices_matched: number;
      repaired: number;
      failed: number;
      skipped_manual_review: number;
      skipped: Record<PaidMonthlyInvoiceChildSettlementSkipReason, number>;
      failures: Array<{ invoiceId: string; bookingId: string; error: string }>;
    }
  | { ok: false; error: string };

type CandidateRow = MonthlyInvoiceSettlementChildRow & {
  monthly_invoice_id: string | null;
  status: string | null;
  payment_status: string | null;
  payout_status: string | null;
  payout_frozen_cents: number | null;
  cleaner_earnings_total_cents?: number | null;
  refund_status?: string | null;
  refunded_at?: string | null;
  is_team_job?: boolean | null;
  team_id?: string | null;
};

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

function norm(s: string | null | undefined): string {
  return String(s ?? "").trim().toLowerCase();
}

function positiveCents(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

function isFullySettled(row: CandidateRow): boolean {
  return (
    norm(row.payment_status) === "success" &&
    norm(row.payout_status) === "eligible" &&
    positiveCents(row.payout_frozen_cents) != null
  );
}

function hasPositiveEarningsBasis(row: CandidateRow): boolean {
  return (
    positiveCents(row.display_earnings_cents) != null ||
    positiveCents(row.cleaner_payout_cents) != null ||
    positiveCents(row.cleaner_earnings_total_cents) != null
  );
}

function refundOrDisputeBlocked(row: CandidateRow): boolean {
  if (typeof row.refunded_at === "string" && row.refunded_at.trim()) return true;
  const refund = norm(row.refund_status);
  return Boolean(refund && !["none", "failed", "cancelled", "canceled"].includes(refund));
}

function increment(
  skipped: Record<PaidMonthlyInvoiceChildSettlementSkipReason, number>,
  reason: PaidMonthlyInvoiceChildSettlementSkipReason,
): void {
  skipped[reason] += 1;
}

export async function repairPaidMonthlyInvoiceChildSettlementDrift(
  admin: SupabaseClient,
  options?: { repairLimit?: number; scanLimit?: number },
): Promise<RepairPaidMonthlyInvoiceChildSettlementDriftResult> {
  const repairLimit = clamp(
    options?.repairLimit ?? DEFAULT_REPAIR_MONTHLY_CHILD_SETTLEMENT_LIMIT,
    1,
    MAX_REPAIR_MONTHLY_CHILD_SETTLEMENT_LIMIT,
  );
  const scanLimit = clamp(
    options?.scanLimit ?? DEFAULT_REPAIR_MONTHLY_CHILD_SETTLEMENT_SCAN,
    repairLimit,
    MAX_REPAIR_MONTHLY_CHILD_SETTLEMENT_SCAN,
  );

  const skipped: Record<PaidMonthlyInvoiceChildSettlementSkipReason, number> = {
    already_settled: 0,
    invoice_not_paid: 0,
    child_cancelled: 0,
    refund_or_dispute_blocked: 0,
    missing_earnings_basis: 0,
    uncertain_team_payout_integrity: 0,
  };

  const { data: candidateRows, error: scanErr } = await admin
    .from("bookings")
    .select(
      "id, monthly_invoice_id, status, payment_status, payout_status, payout_frozen_cents, total_paid_zar, amount_paid_cents, display_earnings_cents, cleaner_payout_cents, cleaner_earnings_total_cents, refund_status, refunded_at, is_team_job, team_id",
    )
    .not("monthly_invoice_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(scanLimit);

  if (scanErr) return { ok: false, error: scanErr.message };

  const rows = (candidateRows ?? []) as CandidateRow[];
  const candidates_scanned = rows.length;
  const invoiceIds = [...new Set(rows.map((r) => String(r.monthly_invoice_id ?? "")).filter(Boolean))];

  const invoiceStatusById = new Map<string, string>();
  if (invoiceIds.length > 0) {
    const { data: invoices, error: invErr } = await admin
      .from("monthly_invoices")
      .select("id, status")
      .in("id", invoiceIds);
    if (invErr) return { ok: false, error: invErr.message };

    for (const inv of invoices ?? []) {
      const row = inv as { id?: string | null; status?: string | null };
      if (row.id) invoiceStatusById.set(row.id, norm(row.status));
    }
  }

  const repairable: CandidateRow[] = [];
  for (const row of rows) {
    const invoiceId = String(row.monthly_invoice_id ?? "");
    if (norm(invoiceStatusById.get(invoiceId)) !== "paid") {
      increment(skipped, "invoice_not_paid");
      continue;
    }
    if (norm(row.status) === "cancelled") {
      increment(skipped, "child_cancelled");
      continue;
    }
    if (refundOrDisputeBlocked(row)) {
      increment(skipped, "refund_or_dispute_blocked");
      continue;
    }
    if (row.is_team_job === true || Boolean(row.team_id)) {
      increment(skipped, "uncertain_team_payout_integrity");
      continue;
    }
    if (isFullySettled(row)) {
      increment(skipped, "already_settled");
      continue;
    }
    if (!hasPositiveEarningsBasis(row)) {
      increment(skipped, "missing_earnings_basis");
      continue;
    }
    repairable.push(row);
  }

  const limited = repairable.slice(0, repairLimit);
  const byInvoice = new Map<string, CandidateRow[]>();
  for (const row of limited) {
    const invoiceId = String(row.monthly_invoice_id);
    byInvoice.set(invoiceId, [...(byInvoice.get(invoiceId) ?? []), row]);
  }

  let repaired = 0;
  const failures: Array<{ invoiceId: string; bookingId: string; error: string }> = [];

  for (const [invoiceId, children] of byInvoice) {
    const result = await settleMonthlyInvoiceChildren(admin, {
      invoiceId,
      children,
      source: "monthly_invoice/repair_child_settlement_drift",
      reference: "repair",
    });
    repaired += result.settled;
    if (!result.ok) {
      for (const f of result.failures) {
        failures.push({ invoiceId, bookingId: f.bookingId, error: f.error });
      }
    }
  }

  const failed = failures.length;
  const skipped_manual_review =
    skipped.missing_earnings_basis +
    skipped.refund_or_dispute_blocked +
    skipped.uncertain_team_payout_integrity +
    skipped.child_cancelled;

  await logSystemEvent({
    level: failed > 0 ? "error" : "info",
    source: "monthly_invoice/repair_child_settlement_drift",
    message: "monthly_invoice_child_settlement_drift_repair_done",
    context: {
      candidates_scanned,
      children_matched: limited.length,
      invoices_matched: byInvoice.size,
      repaired,
      failed,
      skipped_manual_review,
      skipped,
      repair_limit: repairLimit,
      scan_limit: scanLimit,
      failures,
    },
  });

  return {
    ok: true,
    candidates_scanned,
    children_matched: limited.length,
    invoices_matched: byInvoice.size,
    repaired,
    failed,
    skipped_manual_review,
    skipped,
    failures,
  };
}
