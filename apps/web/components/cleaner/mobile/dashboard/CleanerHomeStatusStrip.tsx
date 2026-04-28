"use client";

import { cn } from "@/lib/utils";

export type CleanerHomeJobFilter = "today" | "upcoming" | "past" | "new";

const FILTERS: { key: CleanerHomeJobFilter; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "new", label: "New" },
  { key: "past", label: "Past" },
];

type Props = {
  /** Kept for API compatibility; only used in `strip` layout. */
  isAvailable: boolean;
  activeFilter: CleanerHomeJobFilter;
  onFilterChange: (filter: CleanerHomeJobFilter) => void;
  /** `grid` = one row × four equal columns (header). `strip` = legacy status + buttons row. */
  layout?: "strip" | "grid";
};

export function CleanerHomeStatusStrip({
  isAvailable,
  activeFilter,
  onFilterChange,
  layout = "strip",
}: Props) {
  if (layout === "grid") {
    return (
      <div className="grid w-full min-w-0 grid-cols-4 gap-2 sm:gap-3" role="tablist" aria-label="Job filters">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeFilter === key}
            onClick={() => onFilterChange(key)}
            className={cn(
              "min-h-[40px] w-full min-w-0 rounded-lg px-1 py-2 text-center text-[11px] font-semibold leading-tight transition-colors sm:min-h-[44px] sm:px-2 sm:text-xs",
              activeFilter === key
                ? "bg-blue-600 text-white shadow-sm dark:bg-blue-500"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col gap-2.5 rounded-md px-2 py-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-2 sm:px-2.5 sm:py-2",
        isAvailable
          ? "bg-emerald-50/90 dark:bg-emerald-950/25"
          : "bg-zinc-100/90 dark:bg-zinc-900/60",
      )}
    >
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn("h-2 w-2 shrink-0 rounded-full", isAvailable ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-500")}
          aria-hidden
        />
        <span
          className={cn(
            "whitespace-nowrap text-[11px] font-semibold leading-none sm:text-xs",
            isAvailable ? "text-emerald-950 dark:text-emerald-50" : "text-zinc-800 dark:text-zinc-100",
          )}
        >
          {isAvailable ? "Active & available" : "Unavailable"}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-stretch gap-x-3 gap-y-2 sm:justify-end sm:gap-x-4">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onFilterChange(key)}
            className={cn(
              "min-h-[36px] shrink-0 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors sm:min-h-0 sm:px-4 sm:py-1.5",
              activeFilter === key
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/90 dark:bg-zinc-800 dark:text-zinc-50 dark:ring-zinc-600"
                : "text-zinc-600 hover:bg-white/60 dark:text-zinc-400 dark:hover:bg-zinc-800/60",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
