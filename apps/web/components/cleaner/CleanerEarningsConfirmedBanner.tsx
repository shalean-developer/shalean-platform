"use client";

import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import { cn } from "@/lib/utils";

export function CleanerEarningsConfirmedBanner({ cents, className }: { cents: number; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm dark:border-sky-900/50 dark:bg-sky-950/35",
        className,
      )}
      role="status"
    >
      <p className="font-semibold tabular-nums text-sky-950 dark:text-sky-100">
        +{formatZarFromCents(cents)} confirmed and added to your earnings
      </p>
    </div>
  );
}
