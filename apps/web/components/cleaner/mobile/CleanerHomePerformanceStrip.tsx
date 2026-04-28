"use client";

import { dailyProgressEncouragement } from "@/lib/cleaner/cleanerPerformanceCopy";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import { cn } from "@/lib/utils";

export function CleanerHomePerformanceStrip({
  todayCents,
  weekCents,
  loading,
  jobsCompleted,
  completedTodayCount,
  className,
}: {
  todayCents: number;
  weekCents: number;
  loading: boolean;
  jobsCompleted?: number;
  completedTodayCount: number;
  className?: string;
}) {
  const encouragement = dailyProgressEncouragement({ jobsCompleted, todayCents, weekCents });
  const streak = completedTodayCount >= 2;

  return (
    <section
      className={cn(
        "rounded-2xl border border-zinc-200/90 bg-white px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80",
        className,
      )}
      aria-label="Earnings progress"
    >
      {loading ? (
        <div className="flex flex-wrap gap-4" aria-hidden>
          <div className="h-8 w-28 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-8 w-32 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-700" />
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Today</p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
              {formatZarFromCents(Math.max(0, Math.round(todayCents)))}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              This week
            </p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
              {formatZarFromCents(Math.max(0, Math.round(weekCents)))}
            </p>
            <p className="mt-0.5 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">Mon–Sun</p>
          </div>
        </div>
      )}
      {!loading && streak ? (
        <p className="mt-2 text-xs font-medium text-emerald-800 dark:text-emerald-200/90">You&apos;re on a roll today 💪</p>
      ) : null}
      {!loading && encouragement ? (
        <p className="mt-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">{encouragement}</p>
      ) : null}
    </section>
  );
}
