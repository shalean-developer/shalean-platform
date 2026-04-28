"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CleanerEarningsUnifiedView } from "@/components/cleaner/CleanerEarningsUnifiedView";
import { useCleanerPayoutSummary } from "@/hooks/useCleanerPayoutSummary";
import type { CleanerPayoutSummaryRow } from "@/lib/cleaner/cleanerPayoutSummaryTypes";

export default function CleanerEarningsPage() {
  const router = useRouter();
  const { loading, error, summary, rows, missingBankDetails, refresh } = useCleanerPayoutSummary();

  useEffect(() => {
    if (!loading && error === "Not signed in.") {
      router.replace("/cleaner/login");
    }
  }, [loading, error, router]);

  const paidRowsSorted = useMemo(() => {
    const paid = rows.filter((r) => r.payout_status === "paid" || r.payout_status === "invalid");
    paid.sort((a, b) => {
      const ai = a.payout_status === "invalid" ? 1 : 0;
      const bi = b.payout_status === "invalid" ? 1 : 0;
      if (ai !== bi) return bi - ai;
      return String(b.payout_paid_at ?? "").localeCompare(String(a.payout_paid_at ?? ""));
    });
    return paid as CleanerPayoutSummaryRow[];
  }, [rows]);

  const pendingJobCount = useMemo(() => rows.filter((r) => r.payout_status === "pending").length, [rows]);

  if (loading) {
    return (
      <main className="mx-auto max-w-md space-y-8 px-4 py-8">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-10 w-40 animate-pulse rounded-lg bg-zinc-200/80 dark:bg-zinc-800/80" />
        <div className="h-24 w-full animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
      </main>
    );
  }

  if (error && error !== "Not signed in.") {
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </p>
      </main>
    );
  }

  const s = summary ?? {
    pending_cents: 0,
    eligible_cents: 0,
    paid_cents: 0,
    invalid_cents: 0,
    today_cents: 0,
    week_cents: 0,
    month_cents: 0,
  };

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Earnings</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Money and payouts in one place.</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      <CleanerEarningsUnifiedView
        todayCents={s.today_cents ?? 0}
        weekCents={s.week_cents ?? 0}
        monthCents={s.month_cents ?? 0}
        eligibleCents={s.eligible_cents}
        pendingCents={s.pending_cents}
        paidCents={s.paid_cents}
        invalidCents={s.invalid_cents ?? 0}
        pendingJobCount={pendingJobCount}
        missingBankDetails={missingBankDetails}
        paidRowsSorted={paidRowsSorted}
      />
    </main>
  );
}
