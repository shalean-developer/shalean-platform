"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CleanerEarningsOverview } from "@/components/cleaner/CleanerEarningsOverview";
import { useCleanerPayoutSummary } from "@/hooks/useCleanerPayoutSummary";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { getActiveMobileJob, getNextUpcomingMobileJob, type CleanerMobileJobView } from "@/lib/cleaner/cleanerMobileBookingMap";
import type { CleanerPayoutSummary } from "@/lib/cleaner/cleanerPayoutSummaryTypes";

export default function CleanerEarningsPage() {
  const router = useRouter();
  const { loading, error, summary, rows, missingBankDetails, hasFailedTransfer, refresh } = useCleanerPayoutSummary();
  const [highlightJob, setHighlightJob] = useState<CleanerMobileJobView | null>(null);
  const [openJobsCount, setOpenJobsCount] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && error === "Not signed in.") {
      router.replace("/cleaner/login");
    }
  }, [loading, error, router]);

  useEffect(() => {
    if (loading || error) return;
    let cancelled = false;
    (async () => {
      try {
        const headers = await getCleanerAuthHeaders();
        if (!headers || cancelled) return;
        const res = await cleanerAuthenticatedFetch("/api/cleaner/jobs", { headers });
        const json = (await res.json().catch(() => ({}))) as { jobs?: CleanerBookingRow[] };
        if (cancelled || !res.ok || !Array.isArray(json.jobs)) {
          setHighlightJob(null);
          setOpenJobsCount(null);
          return;
        }
        const list = json.jobs;
        setHighlightJob(getActiveMobileJob(list) ?? getNextUpcomingMobileJob(list));
        setOpenJobsCount(
          list.filter((r) => {
            const st = String(r.status ?? "").toLowerCase();
            return st !== "completed" && st !== "cancelled";
          }).length,
        );
      } catch {
        if (!cancelled) {
          setHighlightJob(null);
          setOpenJobsCount(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, error]);

  if (loading) {
    return (
      <main className="mx-auto max-w-md space-y-4 px-4 py-8">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-24 animate-pulse rounded-xl bg-zinc-200/80 dark:bg-zinc-800/80" />
        <div className="h-36 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800/60" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
          <div className="h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
        </div>
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

  const s: CleanerPayoutSummary =
    summary ?? {
      pending_cents: 0,
      eligible_cents: 0,
      paid_cents: 0,
      frozen_batch_cents: 0,
      invalid_cents: 0,
      today_cents: 0,
      week_cents: 0,
      month_cents: 0,
    };

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Earnings</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Money first — then jobs and history.</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="min-h-[44px] rounded-xl border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      <CleanerEarningsOverview
        summary={s}
        rows={rows}
        missingBankDetails={missingBankDetails}
        hasFailedTransfer={hasFailedTransfer}
        completedEarningsRowCount={rows.length}
        highlightJob={highlightJob}
        openJobsCount={openJobsCount}
      />
    </main>
  );
}
