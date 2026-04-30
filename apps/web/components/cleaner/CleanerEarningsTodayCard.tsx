"use client";

import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";

export function CleanerEarningsTodayCard({ todayCents, weekCents }: { todayCents: number; weekCents: number }) {
  return (
    <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Today</p>
      <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
        {formatZarFromCents(todayCents)}
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Johannesburg calendar, by job completion</p>
      {weekCents > 0 ? (
        <p className="mt-2 border-t border-zinc-100 pt-2 text-sm font-medium tabular-nums text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
          This week · {formatZarFromCents(weekCents)}
        </p>
      ) : null}
    </div>
  );
}
