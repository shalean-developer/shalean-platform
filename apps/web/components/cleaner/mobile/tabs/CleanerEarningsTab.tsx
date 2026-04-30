"use client";

import { CleanerEarningsOverview } from "@/components/cleaner/CleanerEarningsOverview";
import type { CleanerMobileJobView } from "@/lib/cleaner/cleanerMobileBookingMap";
import type { CleanerPayoutSummaryRow } from "@/hooks/useCleanerPayoutSummary";
import type { CleanerPayoutSummary } from "@/lib/cleaner/cleanerPayoutSummaryTypes";

export function CleanerEarningsTab({
  loading,
  error,
  payoutSummary,
  payoutLoading,
  payoutError,
  payoutRows,
  missingBankDetails = false,
  hasFailedTransfer = false,
  highlightJob = null,
  openJobsCount = null,
  onRefreshPayout,
}: {
  loading?: boolean;
  error?: string | null;
  payoutSummary?: {
    eligible_cents: number;
    pending_cents: number;
    paid_cents: number;
    frozen_batch_cents?: number;
    invalid_cents?: number;
    today_cents: number;
    week_cents: number;
    month_cents: number;
  } | null;
  payoutLoading?: boolean;
  payoutError?: string | null;
  payoutRows?: CleanerPayoutSummaryRow[];
  missingBankDetails?: boolean;
  hasFailedTransfer?: boolean;
  highlightJob?: CleanerMobileJobView | null;
  openJobsCount?: number | null;
  onRefreshPayout?: () => void | Promise<void>;
}) {
  const rows = payoutRows ?? [];

  if (loading || payoutLoading) {
    return (
      <div className="space-y-4 py-2">
        <div className="h-24 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-36 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800/60" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
          <div className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
        {error}
      </div>
    );
  }

  if (payoutError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
        {payoutError}
      </div>
    );
  }

  const s: CleanerPayoutSummary =
    payoutSummary ?? {
      eligible_cents: 0,
      pending_cents: 0,
      paid_cents: 0,
      frozen_batch_cents: 0,
      invalid_cents: 0,
      today_cents: 0,
      week_cents: 0,
      month_cents: 0,
    };

  return (
    <CleanerEarningsOverview
      summary={s}
      rows={rows}
      missingBankDetails={missingBankDetails}
      hasFailedTransfer={hasFailedTransfer}
      completedEarningsRowCount={rows.length}
      highlightJob={highlightJob ?? null}
      openJobsCount={openJobsCount ?? null}
      onRefresh={onRefreshPayout}
      showRefresh
      className="py-2"
    />
  );
}
