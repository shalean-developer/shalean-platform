"use client";

import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import { nextPayoutStickySubtitle } from "@/lib/cleaner/cleanerPayoutCopy";
import { cn } from "@/lib/utils";

type Props = {
  /** Frozen weekly batch + eligible (not yet locked) — “available” money cleaners care about first. */
  availableCents: number;
  /** Mon–Sun completed earnings (Johannesburg), optional one-liner under subtitle. */
  weekCents?: number;
  className?: string;
};

export function CleanerEarningsStickyHeader({ availableCents, weekCents = 0, className }: Props) {
  return (
    <div
      className={cn(
        "sticky top-0 z-30 border-b border-zinc-200/90 bg-zinc-50/95 px-4 py-3 shadow-sm backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95",
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Available</p>
      <p className="text-2xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
        {formatZarFromCents(availableCents)}
      </p>
      <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{nextPayoutStickySubtitle()}</p>
      {weekCents > 0 ? (
        <p className="mt-1 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">This week · {formatZarFromCents(weekCents)}</p>
      ) : null}
    </div>
  );
}
