"use client";

import type { BookFlowStep } from "@/src/features/book/bookFlowTypes";
import { bookFlowStepLabel, bookFlowStepIndex } from "@/src/features/book/bookFlowSteps";
import { cn } from "@/lib/utils";

const VISIBLE_STEPS: BookFlowStep[] = ["service", "property", "schedule", "cleaner", "auth", "summary"];

type BookStepIndicatorProps = {
  current: BookFlowStep;
  /** When true, auth step is skipped in the progress bar */
  skipAuth: boolean;
};

export function BookStepIndicator({ current, skipAuth }: BookStepIndicatorProps) {
  const steps = skipAuth ? VISIBLE_STEPS.filter((s) => s !== "auth") : VISIBLE_STEPS;
  const currentIdx = bookFlowStepIndex(current);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Book a clean</p>
      <div className="flex items-center gap-2" role="status" aria-live="polite">
        <span className="text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
          Step {Math.max(1, steps.indexOf(current) + 1)} of {steps.length}
        </span>
        <span className="hidden text-xs text-zinc-500 sm:inline dark:text-zinc-400">
          · {bookFlowStepLabel(current)}
        </span>
      </div>
      <div className="flex gap-1" aria-hidden>
        {steps.map((step) => {
          const idx = bookFlowStepIndex(step);
          const active = idx <= currentIdx;
          return (
            <span
              key={step}
              className={cn(
                "h-1.5 flex-1 rounded-full sm:max-w-12",
                active ? "bg-emerald-500" : "bg-zinc-200 dark:bg-zinc-700",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
