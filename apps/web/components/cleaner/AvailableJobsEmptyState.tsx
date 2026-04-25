"use client";

import { Inbox } from "lucide-react";

/** Shown when there are no individual dispatch offers (team jobs stay under My Jobs). */
export function AvailableJobsEmptyState({ className }: { className?: string }) {
  return (
    <div
      className={[
        "rounded-2xl border border-zinc-200 bg-zinc-50/90 px-4 py-5 text-center dark:border-zinc-700 dark:bg-zinc-900/40",
        className ?? "",
      ].join(" ")}
    >
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-200/80 dark:bg-zinc-800">
        <Inbox className="h-5 w-5 text-zinc-600 dark:text-zinc-300" aria-hidden />
      </div>
      <p className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">No available jobs right now</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        We&apos;ll notify you when new work is available.
      </p>
    </div>
  );
}
