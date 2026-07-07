import { MONTHLY_PAYOUT_START_YMD } from "@/lib/payout/payoutPeriodConfig";
import type { CleanerPayoutSummaryRow } from "@/lib/cleaner/cleanerPayoutSummaryTypes";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Fixed audit run id for pre-July pipeline rows retired to paid on cleaner dashboards. */
export const RETIRED_PRE_JULY_PAYOUT_RUN_ID = "00000000-0000-4000-8000-000610450001";

export function parseVisitYmd(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim().slice(0, 10);
  return YMD_RE.test(t) ? t : null;
}

/** Visit service date is on or after the monthly payout epoch (July 2026). */
export function visitYmdInCleanerPayoutEpoch(visitYmd: string | null | undefined): boolean {
  const ymd = parseVisitYmd(visitYmd);
  return ymd != null && ymd >= MONTHLY_PAYOUT_START_YMD;
}

/** Only July+ visits belong in cleaner pending / processing pipeline totals. */
export function isCleanerDashboardPipelineVisit(visitYmd: string | null | undefined): boolean {
  return visitYmdInCleanerPayoutEpoch(visitYmd);
}

function syntheticPaidAtIso(visitYmd: string | null, completedAt: string | null | undefined): string | null {
  if (typeof completedAt === "string" && completedAt.trim()) return completedAt.trim();
  const ymd = parseVisitYmd(visitYmd);
  return ymd ? `${ymd}T12:00:00+02:00` : null;
}

/**
 * Pre-July open pipeline rows are retired on cleaner dashboards — shown as paid and excluded
 * from pending / eligible / frozen summary buckets.
 */
export function retiredEpochCleanerDashboardPayoutWire(input: {
  visitYmd: string | null | undefined;
  normalized: CleanerPayoutSummaryRow;
  inLockedWeeklyBatch: boolean;
  completedAt?: string | null;
}): {
  payout_status: CleanerPayoutSummaryRow["payout_status"];
  payout_paid_at: string | null;
  payout_run_id: string | null;
  in_frozen_batch: boolean;
  counts_toward_pipeline: boolean;
} {
  if (isCleanerDashboardPipelineVisit(input.visitYmd)) {
    return {
      payout_status: input.normalized.payout_status,
      payout_paid_at: input.normalized.payout_paid_at,
      payout_run_id: input.normalized.payout_run_id,
      in_frozen_batch: input.inLockedWeeklyBatch,
      counts_toward_pipeline: true,
    };
  }

  const openPipeline =
    input.inLockedWeeklyBatch ||
    input.normalized.payout_status === "pending" ||
    input.normalized.payout_status === "eligible";

  if (!openPipeline) {
    return {
      payout_status: input.normalized.payout_status,
      payout_paid_at: input.normalized.payout_paid_at,
      payout_run_id: input.normalized.payout_run_id,
      in_frozen_batch: false,
      counts_toward_pipeline: false,
    };
  }

  return {
    payout_status: "paid",
    payout_paid_at: syntheticPaidAtIso(parseVisitYmd(input.visitYmd), input.completedAt ?? null),
    payout_run_id: input.normalized.payout_run_id ?? RETIRED_PRE_JULY_PAYOUT_RUN_ID,
    in_frozen_batch: false,
    counts_toward_pipeline: false,
  };
}
