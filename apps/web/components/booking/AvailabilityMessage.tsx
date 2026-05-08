"use client";

import { CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type AvailabilitySlot = {
  time: string;
};

type AvailabilityMessageProps = {
  slots?: AvailabilitySlot[];
  showExactTime?: boolean;
  lowAvailabilityThreshold?: number;
  className?: string;
};

function formatSlotTimeLabel(time: string): string {
  const [hRaw, mRaw] = time.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function AvailabilityMessage({
  slots,
  showExactTime = false,
  lowAvailabilityThreshold = 3,
  className,
}: AvailabilityMessageProps) {
  const availableCount = Array.isArray(slots) ? slots.length : 0;
  const firstSlot = availableCount > 0 ? slots![0] : null;

  const shell = "flex items-start gap-2.5 rounded-xl border px-3 py-2.5";

  if (!firstSlot || !showExactTime) {
    return (
      <div
        className={cn(
          shell,
          "border-emerald-200/85 bg-emerald-50/95 dark:border-emerald-900/45 dark:bg-emerald-950/35",
          className,
        )}
        role="status"
      >
        <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <p className="text-sm font-medium leading-snug text-emerald-950 dark:text-emerald-100">
          Times available — pick one to lock your price
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-1 rounded-xl border border-emerald-200/85 bg-emerald-50/95 px-3 py-2.5 dark:border-emerald-900/45 dark:bg-emerald-950/35",
        className,
      )}
      role="status"
    >
      <div className="flex items-start gap-2.5">
        <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <p className="text-sm font-medium text-emerald-950 dark:text-emerald-100">
          Next available: <span className="tabular-nums">{formatSlotTimeLabel(firstSlot.time)}</span>
        </p>
      </div>
      {availableCount <= lowAvailabilityThreshold ? (
        <p className="pl-[1.625rem] text-sm font-medium text-amber-800 dark:text-amber-200/95">
          Only {availableCount} slot{availableCount === 1 ? "" : "s"} left on this day
        </p>
      ) : null}
      <p className="pl-[1.625rem] text-xs leading-snug text-zinc-600 dark:text-zinc-400">
        Choose a time to lock your visit total
      </p>
    </div>
  );
}

