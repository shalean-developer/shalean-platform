"use client";

import { cn } from "@/lib/utils";
import type { CleanerPayoutSummaryRow } from "@/lib/cleaner/cleanerPayoutSummaryTypes";

function labelForRow(row: CleanerPayoutSummaryRow): string {
  if (row.payout_status === "invalid" || row.__invalid) return "Needs attention";
  if (row.payout_status === "paid") return "Paid";
  if (row.in_frozen_batch) return "Scheduled";
  if (row.payout_status === "eligible") return "Ready";
  if (row.payout_status === "pending") return "Pending";
  return "Pending";
}

function classForRow(row: CleanerPayoutSummaryRow): string {
  if (row.payout_status === "invalid" || row.__invalid) {
    return "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100";
  }
  if (row.payout_status === "paid") {
    return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/45 dark:text-emerald-100";
  }
  if (row.in_frozen_batch) {
    return "bg-sky-100 text-sky-950 dark:bg-sky-950/40 dark:text-sky-100";
  }
  if (row.payout_status === "eligible") {
    return "bg-blue-100 text-blue-950 dark:bg-blue-950/40 dark:text-blue-100";
  }
  return "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100";
}

export function PayoutStatusBadge({ row }: { row: CleanerPayoutSummaryRow }) {
  return (
    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-semibold", classForRow(row))}>
      {labelForRow(row)}
    </span>
  );
}
