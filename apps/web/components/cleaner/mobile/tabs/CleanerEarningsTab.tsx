"use client";

import { useMemo } from "react";
import { CleanerEarningsUnifiedView } from "@/components/cleaner/CleanerEarningsUnifiedView";
import type { CleanerPayoutSummaryRow } from "@/hooks/useCleanerPayoutSummary";

export function CleanerEarningsTab({
  loading,
  error,
  payoutSummary,
  payoutLoading,
  payoutError,
  payoutRows,
  missingBankDetails = false,
}: {
  loading?: boolean;
  error?: string | null;
  payoutSummary?: {
    eligible_cents: number;
    pending_cents: number;
    paid_cents: number;
    invalid_cents?: number;
    today_cents: number;
    week_cents: number;
    month_cents: number;
  } | null;
  payoutLoading?: boolean;
  payoutError?: string | null;
  payoutRows?: CleanerPayoutSummaryRow[];
  missingBankDetails?: boolean;
}) {
  const rows = payoutRows ?? [];

  const paidRowsSorted = useMemo(() => {
    const paid = rows.filter((r) => r.payout_status === "paid" || r.payout_status === "invalid");
    paid.sort((a, b) => {
      const ai = a.payout_status === "invalid" ? 1 : 0;
      const bi = b.payout_status === "invalid" ? 1 : 0;
      if (ai !== bi) return bi - ai;
      return String(b.payout_paid_at ?? "").localeCompare(String(a.payout_paid_at ?? ""));
    });
    return paid;
  }, [rows]);

  const pendingJobCount = useMemo(() => rows.filter((r) => r.payout_status === "pending").length, [rows]);

  if (loading || payoutLoading) {
    return (
      <div className="space-y-8 py-2">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-8 w-40 animate-pulse rounded-lg bg-zinc-200/80 dark:bg-zinc-800/80" />
        <div className="h-24 w-full animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
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

  const s = payoutSummary ?? {
    eligible_cents: 0,
    pending_cents: 0,
    paid_cents: 0,
    invalid_cents: 0,
    today_cents: 0,
    week_cents: 0,
    month_cents: 0,
  };

  return (
    <CleanerEarningsUnifiedView
      todayCents={s.today_cents}
      weekCents={s.week_cents}
      monthCents={s.month_cents}
      eligibleCents={s.eligible_cents}
      pendingCents={s.pending_cents}
      paidCents={s.paid_cents}
      invalidCents={s.invalid_cents ?? 0}
      pendingJobCount={pendingJobCount}
      missingBankDetails={missingBankDetails}
      paidRowsSorted={paidRowsSorted}
      completedEarningsRowCount={rows.length}
      className="py-2"
    />
  );
}
